# Auditoría de PII y secretos en el repositorio

**Fecha**: 2026-08-20
**Repo**: `mdqclio/SGH` — **público**
**Rama del informe**: `diag/pii-audit` (desde `main` @ `f246e87`)
**Alcance**: read-only. No se modificó, borró ni reescribió nada.

> **Este documento no contiene ningún dato personal.** Sólo cantidades, rutas y SHAs.
> Los conteos se hicieron sobre los blobs; los valores nunca se copiaron acá ni al chat.

---

## Resumen ejecutivo

| # | Hallazgo | Gravedad | ¿En `main`? |
|---|---|---|---|
| 1 | JWT **`service_role`** en la historia, 25 commits | **Crítico** | **Sí**, los 25 |
| 2 | DNI + nombre + teléfono + fecha de nacimiento en `fix/dni-*` | Alto | No |
| 3 | DNI en el árbol **actual** de `main`, servidos por GitHub Pages | Alto | **Sí** |
| 4 | Claves `anon` (legacy) en la historia y en el árbol actual | Bajo | Sí |
| 5 | Emails de personas físicas en docs y código | Medio | Sí (parcial) |
| 6 | 1 CUIT | Bajo | Sí |

**Lo más urgente no son los dos branches de DNI.** Son el `service_role` (hallazgo 1) y los
DNI que ya están en `main` y se sirven por HTTPS (hallazgo 3). Los dos branches se pueden
borrar; `main` hay que reescribirlo.

---

## 1 · Los dos branches de DNI

Ambos parten de `5a8b9c3` y **ninguno está mergeado en `main`**.
`fix/dni-jockeys` **contiene** a `fix/dni-cuidadores`: es un superconjunto.

### `fix/dni-cuidadores` — 3 commits

```
9653310  data(dni-cuidadores): propuesta de UPDATEs desde padrón de secretaría
483baf1  data(dni-cuidadores): ARREGUI != ARREGUY, descartar matches por 2do nombre
594ac17  data(dni-cuidadores): aplicado a prod — 46 UPDATE, conteos verificados
```

### `fix/dni-jockeys` — 5 commits (los 3 de arriba + 2)

```
a8ce922  data(dni-jockeys): propuesta de UPDATEs desde padrón de secretaría
9e607c9  data(dni-jockeys): aplicado a prod — 71 UPDATE, conteos verificados
```

### Contenido — qué hay exactamente

| Archivo | Líneas | DNI distintos |
|---|---|---|
| `docs/DNI_CUIDADORES_PADRON.md` | 205 | 23 |
| `docs/DNI_JOCKEYS_PADRON.md` | 286 | 34 |
| `migrations/dni_cuidadores_padron_yesi.sql` | 119 | 23 |
| `migrations/dni_jockeys_padron_yesi.sql` | 152 | 36 |
| `CHANGELOG.md` (delta) | +76 | 7 |

**No es sólo DNI.** Desglose por columna en los dos `.sql`:

| Columna | `dni_cuidadores` | `dni_jockeys` | Total |
|---|---|---|---|
| `documento_nro` | 17 | 25 | **42** |
| `telefono` | 28 | 13 | **41** |
| `fecha_nacimiento` | — | 25 | **25** |
| `nombre` | 1 | 8 | 9 |
| **UPDATE totales** | 46 | 71 | 117 |

Además, **cada `UPDATE` lleva el nombre y apellido de la persona en un comentario de línea**
(46 + 71 = 117 comentarios). O sea que el archivo asocia nombre ↔ DNI ↔ teléfono ↔ fecha de
nacimiento, que es exactamente el combo que hace que esto importe.

**Personas afectadas**: 34 UUID distintos en cuidadores + 28 en jockeys = **62 fichas**
de `profesionales`. Los DNI distintos (42) son menos que las fichas porque no toda fila
recibe documento — a muchas se les corrige sólo teléfono o fecha.

**Estos dos branches se resuelven borrándolos.** No están en `main`, no aportan nada que
`main` necesite, y las migraciones ya se aplicaron en prod.

---

## 2 · PII en el árbol **actual** de `main`

Esto es lo que está publicado ahora mismo. Búsqueda sobre `origin/main` (no sobre la
historia): 73 archivos con números de 7-8 dígitos, de los cuales **35 son falso positivo**
(SHAs de git, ids de studbook, montos). Los que tienen contexto de documento:

| DNI distintos | Archivo | ¿Lo sirve Pages? |
|---|---|---|
| 35 | `supabase/functions/reunion-json/_build/post_v16_260620.json` | 404 |
| 35 | `supabase/functions/reunion-json/_build/baseline_v15_260620.json` | 404 |
| 8 | `migrations/personas_r8_tanda_4.sql` | **200** |
| 7 | `docs/RELEVAMIENTO_SOLICITUD_ORIGEN_2026-08-19.md` | **200** |
| 6 | `docs/TANDA_4_R8.md` | **200** |
| 5 | `tools/samples/9999_sample.json` | (datos de prueba) |
| 5 | `supabase/functions/reunion-json/_build/baseline_v15_990101.json` | (datos de prueba) |
| 5 | `tools/seed_9999_resultados.sql` | (datos de prueba, "PRUEBA 9999") |
| 4 | `docs/MONTAS_R6_CORRECCION.md` | 200 |
| 3 | `docs/TANDA_5_R8.md`, `docs/PERF_AUDIT.md`, `docs/CABALLERIZAS_JSON_DIEGO.md`, `migrations/personas_r8_tanda_3.sql` | 200 |
| 2 | `CHANGELOG.md`, `docs/TANDA_3_R8.md`, `migrations/personas_r8_tanda_5.sql`, y otros 4 | 200 |

Los dos JSON de `_build` tienen **37 campos `"dni"`** cada uno. Dan 404 en Pages porque
Jekyll ignora los directorios que empiezan con `_`, pero **eso no los protege**: el repo es
público y se leen desde la interfaz de GitHub y desde `raw.githubusercontent.com`.

Verificado con `curl` que `migrations/personas_r8_tanda_4.sql`, `docs/TANDA_4_R8.md` y
`docs/RELEVAMIENTO_SOLICITUD_ORIGEN_2026-08-19.md` responden **200** en
`https://mdqclio.github.io/SGH/…`.

> **Nota sobre `docs/RELEVAMIENTO_SOLICITUD_ORIGEN_2026-08-19.md`**: esos 7 DNI los
> introduje yo hoy, en el commit `310016e` (Adenda 2), en una tabla que compara nombres
> entre `profesionales` y `propietarios`. Entró a `main` con el merge `f246e87` de hace un
> rato. Es PII nueva, no heredada, y la tabla asocia DNI con apellido y nombre. Debería
> salir de la remediación junto con el resto — o antes, porque es la más reciente y la más
> fácil de sacar.

---

## 3 · Secretos

### 3.1 JWT `service_role` — crítico

Se encontraron **3 JWT distintos** en toda la historia, todos del proyecto
`unlhcuanfrtpatoipwve`, emitidos 2026-04-20 con vencimiento 2036-04-20:

| JWT | `role` |
|---|---|
| #1 | `anon` |
| #2 | `anon` |
| #3 | **`service_role`** |

El `service_role` aparece en **25 blobs / 16 rutas**:

```
tests/probe_nav_dirty.mjs                (4 versiones)
tests/smoke_t9_t16.mjs                   (2)
tests/probe_vacante_hibrido.mjs          (2)
tests/probe_tiempo_ganador.mjs           (2)
tests/probe_modelo_chapa.mjs             (2)
tests/probe_fase2_liquidaciones.mjs      (2)
tests/probe_bug3_chapa_at.mjs            (2)
tests/smoke_full.mjs                     (1)
tests/probe_vacante_vac.mjs              (1)
tests/probe_vacante_manual.mjs           (1)
tests/probe_spcs_caballeriza.mjs         (1)
tests/probe_propietario_derivacion.mjs   (1)
tests/probe_no_largo.mjs                 (1)
tests/probe_estado_pista.mjs             (1)
tests/probe_dividendos_inline.mjs        (1)
docs/auditoria/SGH-REMEDIACION.md        (1)
```

**Los 25 commits que lo contienen son alcanzables desde `main`.** Rango 2026-05-23 →
2026-06-07:

```
5a75c7f 4edb093 0ed28f9 3c6a72c a1fcb13 4ffab47 2550222 8c670c2 1a06a34
d36aae5 1b29e98 fd5e5c5 414169d bd2e49f 8a6c37a 3c7b859 c864b61 dd9c956
20fdbc7 fe2cb68 758793f 0081762 e663349 b890f57 53516e6
```

`b890f57` (2026-06-06) es el que lo saca del working tree y `53516e6` (2026-06-07) el del
swap a publishable. Ya **no está en el árbol actual de `main`** — pero sigue en la historia,
y en un repo público eso es igual de legible.

**Sobre la rotación**: sí, las legacy están desactivadas desde 2026-06-07 y hoy la clave no
sirve. Pero un `service_role` bypasea RLS por completo, el token declara vencimiento en 2036,
y "desactivada" es un estado del proyecto que alguien puede revertir por error. Hay que
sacarlo de la historia igual, y conviene confirmar en el dashboard que la legacy sigue
revocada y no sólo "no usada".

### 3.2 Claves `anon` — bajo

Los dos JWT `anon` siguen en el árbol actual de `main`, en 5 archivos:

```
REMEDIACION_RESULTADO.md            (1 fragmento truncado)
docs/ARQUITECTURA.md                (1 JWT completo)
docs/SNIPPETS.md                    (2)
docs/SPEC.md                        (1)
tmp/preview_programa_color_r6.html  (1 fragmento truncado)
```

La `anon` es pública por diseño — va en el frontend. Estas además están desactivadas.
Riesgo real bajo; conviene limpiarlas por higiene, no por urgencia.

### 3.3 Lo que **no** apareció

- Sin `sb_secret_…` en ningún blob de la historia.
- Sin connection strings `postgres://usuario:password@…`.
- Sin valores asignados a `SUPABASE_SECRET_KEY`, `SERVICE_ROLE_KEY` ni `RESEND_API_KEY`.
- `.env` **nunca estuvo trackeado** y `.gitignore` lo cubre (líneas 10-11: `.env`, `.env.*`).

---

## 4 · Emails y CUIT

**29 direcciones distintas** en toda la historia. Por dominio:

| Dominio | Distintas | Lectura |
|---|---|---|
| `sgh.com` | 4 | cuentas del sistema, no personas |
| `sgh-probe.invalid` | 4 | generadas por los probes |
| `hipodromo.com.ar` | 3 | institucional / de ejemplo |
| `gmail.com` | 3 | **personas físicas** |
| `ejemplo.com` | 3 | placeholder |
| `mdq.com.ar` | 2 | **probable persona física** |
| `mail.com` | 2 | a verificar |
| `descartable.tld` | 2 | placeholder |
| otros (`club.com`, `correo.com`, `email.com`, `hipodromoejemplo.com.ar`, `mail.app.supabase.io`, `github.com`) | 1 c/u | placeholders / infra |

Los de dominio real aparecen en 16 rutas, entre ellas `admin.html`, `login.html`,
`registro.html`, `docs/ALTA_FEDE.md`, `docs/AUDIT_PORTAL_ONBOARDING.md`,
`docs/ANALISIS_R6_PORTAL.md`, `tmp/etapa_a_deploy.md` y tres `migrations/sec_rls_*.sql`.
Hay que revisarlos uno por uno: varios son claramente de ejemplo y otros no.

**Emails de autor de commits**: 824 de los 825 commits están firmados con la misma dirección
`gmail.com` (la del dueño del repo) y 1 con `noreply@anthropic.com`. Es el funcionamiento
normal de git y la dirección es la del propio autor — se anota como dato, no como fuga.

**CUIT**: 1 solo, en `index.html`. Por el contexto es el CUIT del hipódromo, o sea de una
persona jurídica, no de una persona física. Prioridad baja.

**Teléfonos**: no se dan totales sobre la historia completa. La expresión regular de teléfono
argentino tiene demasiados falsos positivos (fechas, montos, ids) para que un número global
signifique algo. Lo que sí está medido con precisión son los **41 `UPDATE` de `telefono`** de
los branches `fix/dni-*` (sección 1), que es donde el dato está estructurado y es cierto.

---

## 5 · Branches

**61 branches remotos** (más `main`).

| Prefijo | Cantidad |
|---|---|
| `fix/` | 25 |
| `chore/` | 9 |
| `tmp/` | 8 |
| `feat/` | 8 |
| `sec/` | 5 |
| `diag/` | 3 |
| `audit/`, `mockup/` | 1 c/u |

**36 están mergeados en `main`** → se borran sin perder nada; su contenido ya vive en `main`.

**24 no están mergeados**:

```
audit/portal-onboarding          chore/apuestas-faltantes-r8     chore/cleanup-backups
chore/prof-diff-20j              chore/propietarios-provisorios-r8
chore/reunion-prueba-9998        chore/rls-audit                 chore/verif-r6
diag/bono-posicion-r8            diag/cotejo-resultados-r6       diag/initauth-activo
feat/asignacion-prof-20j         feat/carga-prof-20j             feat/studbook-extract
fix/dni-cuidadores               fix/dni-jockeys                 fix/pdf-inscriptos-condiciones
sec/autoregistro-gate-4          tmp/alta-fede                   tmp/autoregistro-plan
tmp/deploy-report                tmp/estado-r8                   tmp/probe-analisis
tmp/probe-run-1
```

**11 son basura de trabajo** por nombre (`tmp/*`, `diag/*`, cualquiera con `probe`).
De los no-mergeados, 6 son `tmp/` y 3 son `diag/`: **9 de los 24 se borran sin pensarlo**.

Borrar branches **reduce el trabajo de limpieza pero no lo elimina**: mientras un commit siga
siendo alcanzable desde cualquier ref, sus blobs siguen en el repo. Y GitHub conserva objetos
inalcanzables un tiempo, así que después de reescribir hay que pedirles que corran `gc`.

---

## 6 · Qué implica cada cosa para la limpieza

No es la tarea de hoy, pero conviene que quede escrito el orden de magnitud:

1. **`fix/dni-cuidadores` y `fix/dni-jockeys`**: `git push origin --delete`. Cinco minutos,
   sin riesgo, no están en `main`.
2. **9 branches `tmp/` y `diag/` no mergeados**: revisar que no tengan nada vivo y borrar.
3. **36 branches mergeados**: borrado masivo, cosmético.
4. **El `service_role` y los DNI de `main`**: esto **sí** es reescritura de historia
   (`git filter-repo`) sobre 25+ commits alcanzables desde `main`, con force-push. Rompe
   todos los clones y cambia todos los SHA desde 2026-05-23 en adelante. Es la parte cara y
   hay que planificarla aparte.
5. **Antes de reescribir**: sacar de `main` con un commit normal los archivos que se puedan
   (empezando por `docs/RELEVAMIENTO_SOLICITUD_ORIGEN_2026-08-19.md`, que es de hoy). No
   arregla la historia, pero corta la exposición por Pages y por la vista del repo mientras
   se planifica lo demás.
6. **Evaluar si el repo tiene que seguir siendo público.** Pasarlo a privado no borra nada,
   pero corta el acceso de inmediato y es lo único que se puede hacer en un minuto. Si Pages
   tiene que seguir sirviendo, se puede separar el sitio del repo de trabajo.

---

## Método

- Inventario: `git rev-list --objects --all` → 3718 objetos, **1538 blobs de texto**
  (`.md .sql .js .mjs .html .json .txt .csv .yml .sh .env .cfg .ini`), 825 commits, 3.03 MiB.
- Cada blob se leyó con `git cat-file -p` y se contaron **valores distintos** por patrón.
  Los valores no se persistieron en ningún lado.
- DNI: `[0-9]{7,8}` aislado, excluyendo vecinos de dígito, `.` y `-` (para no romper SHAs,
  UUID y montos). Se clasificó por presencia de las palabras `dni|documento|cuit` en el mismo
  archivo, y se verificó a mano el contexto de los archivos de más volumen.
- JWT: se decodificó **sólo el payload** para leer `role`, `ref`, `iat` y `exp`. Las claves
  no se imprimieron.
- Alcanzabilidad desde `main`: `git merge-base --is-ancestor <commit> origin/main`.
- Exposición pública: `curl` contra `https://mdqclio.github.io/SGH/…`, mirando el código HTTP.

### Limitaciones

- Se scanearon **blobs de texto por extensión**. Un `.pdf`, un `.xlsx`, un `.png` con una
  planilla fotografiada o un archivo sin extensión no entran en este barrido.
- **Los mensajes de commit no se scanearon** por PII, sólo los contenidos de archivo.
- El conteo de DNI es por *valor distinto de 7-8 dígitos con contexto*, no por persona
  verificada. Sobreestima donde hay ids numéricos y subestima donde el DNI está partido o
  con puntos.
- No se auditaron issues, PRs, releases ni GitHub Actions, que también son públicos.
