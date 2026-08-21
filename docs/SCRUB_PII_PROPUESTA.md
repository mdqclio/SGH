# Propuesta de scrub de PII — árbol actual de `main`

**Fecha**: 2026-08-21
**Rama**: `chore/scrub-pii-arbol-actual` (desde `main` @ `f246e87`)
**Alcance**: **sólo el árbol actual**. No se toca la historia de git en este paso.
**Estado**: propuesta. Nada aplicado todavía.

> **Este documento no contiene ningún dato personal.** Sólo rutas, tipos de dato y cantidades.
> Los valores se contaron sobre los archivos y nunca se copiaron acá.

Insumo: `docs/AUDITORIA_PII_2026-08-20.md` (rama `diag/pii-audit`), hallazgos 3, 4, 5 y 6.

---

## Decisiones ya tomadas por el dueño del repo

1. **`git rm --cached` a los 6 archivos trackeados de `tmp/`**: **SÍ**.
2. **`DNI_ANCLA` de `tests/probe_propietario_derivacion.mjs` a variable de entorno**: **SÍ**.

---

## A · Borrar — 3 archivos

| Ruta | Qué contiene | Acción | Por qué | Qué se rompe |
|---|---|---|---|---|
| `supabase/functions/reunion-json/_build/post_v16_260620.json` | 37 campos `dni` no nulos, **22 valores distintos**, junto a 519 campos `nombre`. 243 campos `cuit`, todos `null`. | **Borrar** | Artefacto de build de la Edge Function. Asocia nombre ↔ DNI en texto plano. Regenerable con `tools/studbook_reunion_json.mjs` contra prod. | Nada de código: ningún `.html`/`.js`/`.ts` lo importa ni le hace `fetch`. Sólo lo **nombran** en prosa `CHANGELOG.md`, `docs/DEPLOY_JSON_V2.md`, `docs/ISSUES.md`, `docs/ESTADO.md`, `docs/JSON_V2_CIERRE.md`, `docs/YUNTA_MANDIL_ESTADO.md`, `docs/MERGE_CLEANUP_2026-08-04.md`. Se pierde el baseline byte-exacto para comparar sha256 (los sha256 quedan anotados en `docs/DEPLOY_JSON_V2.md`). |
| `supabase/functions/reunion-json/_build/baseline_v15_260620.json` | 37 campos `dni` no nulos, **22 valores distintos**, 531 campos `nombre`. 243 `cuit` nulos. | **Borrar** | Ídem: baseline de contraste v15 con los mismos datos reales. | Ídem que la fila anterior. |
| `tmp/preview_programa_color_r6.html` | 0 DNI. 1 fragmento **truncado** de JWT `anon` (no decodifica, no es token usable) + nombres de 8 jockeys y 8 entrenadores de un programa. 615 KB (imágenes en base64). | **Borrar** | Es **salida** regenerable, no fuente: la produce `tests/probe_tapa_flyer.mjs` (línea 206). Los nombres de jockeys/entrenadores son públicos en cualquier programa de carreras, pero el archivo no aporta nada al repo. | Nada. `tests/probe_tapa_flyer.mjs` lo **escribe**, no lo lee. |

---

## B · Redactar DNI → `[REDACTADO]` — 14 archivos

Los 14 responden **200** en `https://mdqclio.github.io/SGH/…` (verificado con `curl` el 2026-08-21).

### B.1 · Migraciones (5) — el DNI está **sólo en comentarios `--`**

Verificado línea por línea: en los 5 archivos, **todas** las líneas con un número de 7-8 dígitos empiezan con `--`. No hay un solo DNI dentro de un `INSERT`, `UPDATE`, `VALUES` ni `WHERE`.

| Ruta | Qué contiene | Acción | Por qué | Qué se rompe |
|---|---|---|---|---|
| `migrations/personas_r8_tanda_4.sql` | 9 líneas de comentario con DNI, **7 valores distintos**, cada una con apellido y nombre al lado | **Redactar** | El DNI es anotación de trazabilidad del cotejo con el padrón; el UUID de la ficha ya identifica la fila. | **Nada.** Sólo cambian comentarios. La migración ya está aplicada en prod. |
| `migrations/personas_r8_tanda_5.sql` | 5 líneas de comentario, **2 valores distintos**, con nombre + fecha de nacimiento + localidad | **Redactar** | Ídem. Además acá el DNI convive con fecha de nacimiento, que agrava el combo. | Nada (comentarios). |
| `migrations/personas_r8_tanda_3.sql` | 3 líneas de comentario, **2 valores distintos**, con apellido/nombre + patente | **Redactar** | Ídem. | Nada (comentarios). |
| `migrations/personas_r8_tanda_2.sql` | 1 línea de comentario, 1 valor, con rol y patente | **Redactar** | Ídem. | Nada (comentarios). |
| `migrations/caballerizas_r8_tanda_5.sql` | 1 línea de comentario, 1 valor, con localidad | **Redactar** | Ídem. | Nada (comentarios). |

### B.2 · Documentación y evidencia de probes (9)

| Ruta | Qué contiene | Acción | Por qué | Qué se rompe |
|---|---|---|---|---|
| `docs/RELEVAMIENTO_SOLICITUD_ORIGEN_2026-08-19.md` | **7 valores distintos** en una columna `DNI` de tabla, cada fila con apellido y nombre en dos grafías + 2 menciones sueltas en prosa | **Redactar** (columna entera + las 2 menciones) | Es la PII **más reciente** del árbol: entró a `main` con el merge `f246e87` de anteayer. La tabla compara nombres entre `profesionales` y `propietarios`; para eso alcanza con el par de grafías, el DNI no aporta. | Nada. La tabla sigue siendo legible: lo que se compara son los nombres, no el documento. |
| `docs/TANDA_4_R8.md` | 6 líneas de tabla con `DNI` + nombre completo + caballeriza responsable | **Redactar** | Documento de trabajo del circuito de altas; el DNI era para que Yesi cotejara contra el padrón. Ya se cotejó y se aplicó. | Nada. |
| `docs/TANDA_5_R8.md` | 4 líneas, **2 valores distintos**, con nombre + fecha de nacimiento + localidad. Incluye una pregunta abierta a la secretaría formulada sobre el DNI. | **Redactar** | Ídem. La pregunta se puede reformular por UUID de ficha. | Se pierde legibilidad de una pregunta pendiente; se compensa dejando el UUID de la ficha, que ya está en el mismo párrafo. |
| `docs/TANDA_3_R8.md` | 2 líneas con DNI + apellido/nombre + patente | **Redactar** | Ídem. | Nada. |
| `docs/TANDA_2_R8.md` | 2 líneas: 1 en prosa, 1 en una tabla de verificación antes/después de un `UPDATE` | **Redactar** | Ídem. La tabla de verificación conserva sentido con el valor redactado (lo que importa es el ✅). | Nada. |
| `docs/MONTAS_R6_CORRECCION.md` | 1 DNI en una tabla de cotejo de nombres | **Redactar** | Ídem. Los otros números del archivo son UUID, no documentos. | Nada. |
| `docs/CABALLERIZAS_JSON_DIEGO.md` | 1 par `"dni"` + `"nombre"` dentro de un JSON de muestra pegado en el doc | **Redactar** | Es un ejemplo de forma del payload; la forma se entiende igual con el valor redactado. | Nada. |
| `docs/RESULTADO_COBROS_V1_1.md` | 1 DNI en una línea de evidencia de probe (`✅ d3 documento`) | **Redactar** | Evidencia de que el buscador matchea por documento; no hace falta el valor. | Nada. |
| `docs/FIX_COBROS_BUSQUEDA_CABALLERIZA.md` | 1 DNI en una línea de evidencia de probe | **Redactar** | Ídem. | Nada. |

---

## C · Cambio funcional — 1 archivo

| Ruta | Qué contiene | Acción | Por qué | Qué se rompe |
|---|---|---|---|---|
| `tests/probe_propietario_derivacion.mjs` | 3 constantes de documento: **1 real** (`DNI_ANCLA`, línea 41, usado como criterio de búsqueda contra prod) y 2 sintéticas (`DNI_FAKE_1`, `DNI_FAKE_2`). El comentario adjunto lleva el apellido del titular. | **Redactar + parametrizar**: `DNI_ANCLA` pasa a `process.env.SGH_DNI_ANCLA`; si no está definida, el probe hace *skip* del caso ancla con un mensaje claro en vez de fallar. Las 2 sintéticas quedan. También se redacta el apellido del comentario de la línea 10. | Es el único DNI del árbol que cumple una función real: sin él, el caso ancla no encuentra la caballeriza. Sacarlo a env var corta la exposición sin perder el test. | El probe **deja de correr el caso ancla** si quien lo ejecuta no exporta `SGH_DNI_ANCLA`. Los demás casos siguen corriendo. Queda documentado en el encabezado del archivo. |

---

## D · Emails de personas físicas (hallazgo 5) — redactar 2 archivos

| Ruta | Qué contiene | Acción | Por qué | Qué se rompe |
|---|---|---|---|---|
| `docs/ANALISIS_R6_PORTAL.md` | 1 dirección `gmail.com` de una persona física, en prosa (línea 214) | **Redactar** | Persona física, dominio real, no es una cuenta del sistema. | Nada. |
| `tmp/etapa_a_deploy.md` | 6 ocurrencias del `gmail.com` **personal del dueño del repo** (coincide con `git config user.email`) | **Redactar** | Es dato de persona física. Nota honesta: el mismo valor ya está en el campo autor de 824 commits, así que redactarlo acá **no lo saca del repo**; se hace igual porque no cuesta nada y este archivo sí se sirve por HTTPS (200). | Nada. |

### Emails que **quedan** (decisión del dueño: institucionales se conservan)

| Dirección / patrón | Dónde | Por qué queda |
|---|---|---|
| `clio@mdq.com.ar`, `clio+probe@mdq.com.ar` | `docs/PROBE_TEMPLATE_ES.md`, `docs/SEC_RLS_FASE1/2/3.md`, `migrations/sec_rls_fase1_auth_uid.sql`, `migrations/sec_rls_fase2a_catalogos.sql`, `tmp/etapa_a_deploy.md` | Institucional del propio dueño, explícitamente autorizado a quedarse. |
| `*@sgh.com` (42 ocurrencias) | Varios | Cuentas del sistema (`admin@sgh.com`, `dolores@sgh.com`), no personas. |
| `*@sgh-probe.invalid` (13) | `tests/` | Dominio reservado, generado por los probes. |
| `info@hipodromo.com.ar`, `admin@hipodromo.com.ar` | `admin.html:187,207` | `placeholder=` de inputs. Dominio de ejemplo. |
| `tu@hipodromo.com.ar` | `login.html:189,223` | `placeholder=` de inputs. |
| `tu@correo.com` | `solicitar-acceso.html:196` | `placeholder=` de input. |
| `juan@mail.com` | `docs/AUTOREGISTRO_PLAN.md:331` | Dato inventado dentro de un mockup ASCII. |
| `*@ejemplo.com`, `*@descartable.tld`, `*@hipodromoejemplo.com.ar` | Varios | Placeholders. |

---

## E · CUIT (hallazgo 6) — **nada que hacer**

No es reproducible en el árbol actual. Se buscó:

- `[0-9]{2}-[0-9]{8}-[0-9]` (formato con guiones) → **0 resultados** en todo el árbol.
- 11 dígitos aislados → sólo fracciones decimales y hashes sha256 (falsos positivos).
- `"cuit": "<valor>"` → **0**. Los 243 campos `cuit` de cada JSON de `_build` son **todos `null`**.
- La palabra `CUIT` en `index.html` → **0 ocurrencias**.

Se anota como **falso positivo del scan automático** del 2026-08-20. Si aparece en la historia, se resolverá en el paso de reescritura, no acá.

---

## F · Claves `anon` legacy (hallazgo 4) — redactar 4 archivos

Se decodificó **sólo el payload** para leer `role`. Los 4 tokens completos del árbol actual son `role: anon` — no hay ningún `service_role` en el árbol. Las legacy están desactivadas desde 2026-06-07 (ver `docs/JWT_SERVICE_ROLE_ESTADO.md`), así que esto es **higiene, no urgencia**.

| Ruta | Qué contiene | Acción | Por qué | Qué se rompe |
|---|---|---|---|---|
| `docs/SNIPPETS.md` | 2 JWT `anon` completos | **Redactar** → `sb_publishable_...` | Clave muerta; además el snippet debe enseñar la publishable, que es lo vigente. | Nada. Mejora el snippet: hoy documenta una clave que devuelve 401. |
| `docs/ARQUITECTURA.md` | 1 JWT `anon` completo | **Redactar** → `sb_publishable_...` | Ídem. | Nada. |
| `docs/SPEC.md` | 1 JWT `anon` completo | **Redactar** → `sb_publishable_...` | Ídem. | Nada. |
| `REMEDIACION_RESULTADO.md` | 1 fragmento **truncado** (no decodifica, no es un token usable) | **Redactar** | Higiene: que no quede ni el prefijo reconocible. | Nada. |

**No se tocan** los 13 archivos que mencionan `eyJ` en prosa (`CLAUDE.md`, `docs/GOTCHAS.md`, `docs/SERVER.md`, `docs/DECISIONES.md`, `docs/ESTADO.md`, `CHANGELOG.md`, `SECURITY_AUDIT.md`, `tmp/etapa_b.md`, `supabase/functions/*/index.ts`, etc.): ahí `eyJ` es el nombre del formato dentro de una frase del tipo "las legacy `eyJ` están desactivadas", no hay material de clave.

---

## G · Destrackear `tmp/` + `.gitignore`

### G.1 · `git rm --cached` a los 6 trackeados de `tmp/` (aprobado)

`.gitignore` no destrackea lo que ya está trackeado, así que hace falta el `rm --cached` explícito. Los archivos **quedan en disco**, sólo salen del índice.

| Ruta | Qué contiene | Acción | Por qué | Qué se rompe |
|---|---|---|---|---|
| `tmp/etapa_a_deploy.md` | Notas de deploy + 6 emails personales (ver D) | `git rm --cached` | Doc de trabajo de una etapa cerrada. | Nada. |
| `tmp/etapa_b.md` | Notas de deploy, sin PII ni claves | `git rm --cached` | Ídem. | Nada. |
| `tmp/fix_chapa.md` | Notas de un fix, sin PII | `git rm --cached` | Ídem. | Nada. |
| `tmp/fix_programa_null.md` | Notas de un fix, sin PII | `git rm --cached` | Ídem. | Nada. |
| `tmp/preview_tapa.png` | 1.6 MB, imagen de preview | `git rm --cached` | Salida regenerable de `tests/probe_tapa_flyer.mjs`. | Nada: el probe la vuelve a generar. |
| `tmp/preview_pie.png` | 313 KB, imagen de preview | `git rm --cached` | Ídem. | Nada. |

(`tmp/preview_programa_color_r6.html`, el séptimo trackeado, se **borra** — fila en la sección A.)

### G.2 · Reglas nuevas en `.gitignore`

```
# Directorio de trabajo — nada de tmp/ se commitea
tmp/

# Planillas y export de trabajo (suelen traer PII: DNI, teléfonos, nombres)
*.csv
*.xls
*.xlsx
```

Hoy **no hay ningún `.csv`, `.xls` ni `.xlsx` trackeado** en el repo (`git ls-files` → 0), así que la regla global no destrackea nada por sorpresa. Bloquea de entrada los 8 archivos sueltos que hay ahora mismo en `tmp/` sin commitear (6 `.csv`/`.json` de planillas R5/R6/R8 y 2 scripts).

---

## H · Lo que se deja explícitamente

### H.1 · Datos sintéticos de la reunión de prueba 9999

| Ruta | Qué contiene | Por qué queda |
|---|---|---|
| `tools/samples/9999_sample.json` | 34 campos `dni`, **5 valores distintos**, todos en rango 90.xxx.xxx | Los nombres asociados son `PRUEBA 9999 — BORRAR` en las 34 ocurrencias. Datos fabricados por el seed. |
| `supabase/functions/reunion-json/_build/baseline_v15_990101.json` | Ídem (34 / 5 distintos) | Ídem: baseline de la reunión de prueba. |
| `tools/seed_9999_resultados.sql` | Sólo UUID con relleno numérico; 0 DNI | Falso positivo del scan: lo que matcheaba eran tramos de UUID. |

### H.2 · Documentos generados en runtime o valores dummy

| Ruta | Qué contiene | Por qué queda |
|---|---|---|
| `tests/probe_rls_portal.mjs` | 4 documentos construidos con `String(N + Math.random())` | Se generan en cada corrida; no son de nadie. |
| `tests/probe_autoregistro_e2e.mjs` | 1 documento construido igual | Ídem. |
| `tests/probe_recibos_emision.mjs` | 1 `p_cobrador_documento` con un dummy de la serie `1234…` | Valor dummy conocido, no corresponde a una persona. |
| `solicitar-acceso.html:133` | `placeholder=` del input de DNI, dummy de la serie `1234…` | Es texto de ayuda del formulario. |
| `docs/AUTOREGISTRO_PLAN.md`, `docs/AUTOREGISTRO_GATE_2.md` | Documento y teléfono inventados dentro de mockups ASCII | Datos ficticios de diseño. |

### H.3 · Falsos positivos confirmados uno por uno

Archivos que el scan marcó y que **no tienen PII**: lo que matcheaba eran SHA de git de 7 dígitos todos numéricos, tramos de UUID, montos en pesos con separador de miles, o hashes sha256.

`CLAUDE.md` · `CHANGELOG.md` · `docs/ISSUES.md` · `docs/ESTADO.md` · `docs/PERF_AUDIT.md` · `docs/MERGE_CLEANUP_2026-08-04.md` · `docs/DEPLOY_JSON_V2.md` · `docs/TANDA_5_PUNTO_5_R8.md` · `docs/TANDA_1_R8.md` · `docs/TANDA_1B_R8.md` · `docs/TANDA_4B_R8.md` · `docs/diagnosticos/2026-08-13_programa-r8-imprenta.md` · `docs/ROTACION_STUDBOOK_FASE1.md` · `docs/INTEGRACION_STUDBOOK_ESTADO.md` · `docs/GOTCHAS.md` · `docs/DECISIONES.md` · `docs/SESION_2026-05-16.md` · `tests/probe_piso_warning.mjs` · `tests/probe_reparto_display.mjs`

---

## Verificación de que nada de esto rompe el sitio

1. **Ningún `.html` ni `.js` de la app hace `fetch()` ni `import` de ninguno de los archivos que se borran o se destrackean.** Los únicos imports locales del repo son entre módulos de `supabase/functions/_shared/*.mjs`, que no se tocan.
2. **Los 2 JSON de `_build` no los consume el runtime.** La Edge Function `reunion-json` construye el payload con `buildReunionJson()` desde la base; los JSON son baselines de contraste manual. Sólo se los menciona en prosa, en 7 docs.
3. **Las 5 migraciones ya están aplicadas en prod** y sólo se editan sus comentarios `--`. El SQL ejecutable queda byte-idéntico.
4. **`tmp/preview_programa_color_r6.html`, `tmp/preview_tapa.png` y `tmp/preview_pie.png` son salida, no entrada**: los genera `tests/probe_tapa_flyer.mjs`.
5. **El único cambio con efecto real es `tests/probe_propietario_derivacion.mjs`**, y está acotado a un caso del probe, con *skip* explícito si falta la env var.
6. **Los emails que se redactan están todos en prosa de documentación**, ninguno en código ejecutable ni en configuración.

---

## Lo que este paso **no** resuelve

- **La historia de git queda intacta.** Todos los valores redactados acá siguen siendo legibles con `git log -p` y desde la interfaz de GitHub. Esto corta la exposición por GitHub Pages y por la vista del árbol actual — nada más.
- **El JWT `service_role`** (hallazgo 1) sigue en 25 commits alcanzables desde `main`. Está verificado como no funcional (`docs/JWT_SERVICE_ROLE_ESTADO.md`), pero sale recién en el paso de reescritura.
- **Los branches `fix/dni-cuidadores` y `fix/dni-jockeys`** (hallazgo 2) siguen vivos en el remoto, con 42 DNI, 41 teléfonos y 25 fechas de nacimiento. Se borran aparte.
- **Archivos sin trackear con PII** que hay ahora mismo en el árbol de trabajo: `docs/RELEVAMIENTO_EMAIL_2026-08-19.md` y 6 planillas en `tmp/`. No están en el repo y, con el `.gitignore` nuevo, las de `tmp/` no pueden entrar por descuido. `docs/RELEVAMIENTO_EMAIL_2026-08-19.md` **no** queda cubierto por el `.gitignore`: sigue siendo commiteable a mano, revisarlo antes de agregarlo.

---

## Resumen numérico

| Acción | Archivos |
|---|---|
| Borrar | 3 |
| Redactar DNI | 14 |
| Redactar DNI + parametrizar a env var | 1 |
| Redactar email | 2 |
| Redactar JWT `anon` | 4 |
| `git rm --cached` (quedan en disco) | 6 |
| `.gitignore` | 1 (4 reglas nuevas) |
| **Total de archivos tocados** | **31** |

DNI reales que salen del árbol actual: **36 valores distintos** una vez deduplicados entre todos los archivos
(22 en los 2 JSON de `_build` — el mismo conjunto en los dos — y 22 en docs, migraciones y el probe, con 8 en común
entre ambos grupos).
