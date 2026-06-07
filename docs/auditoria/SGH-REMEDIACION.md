# Remediación de Auditoría — SGH

| | |
|---|---|
| **Repo** | `/home/clio/dev/SGH` (github.com/mdqclio/SGH) |
| **Fecha remediación** | 2026-06-06 |
| **Base** | `docs/auditoria/SGH.md` (auditoría de solo diagnóstico) |
| **Alcance** | SOLO arreglos seguros, reversibles y en código. No se rotaron keys, no se desplegó, no se reescribió historial git. |

**Leyenda:** ✅ arreglado en código · 📄 archivo entregado/modificado · ⏳ acción pendiente del dueño (fuera de código)

---

## ⚠️ ADVERTENCIA CRÍTICA — leer primero

La **`service_role` key de Supabase sigue siendo válida y comprometida** hasta que el dueño la **rote en el dashboard de Supabase**.

- La key estaba hardcodeada en 12 archivos de `tests/` (working tree) **y permanece en el historial de git** (presente en **142 commits**, ver §Pendiente 2).
- Quitarla del working tree (hecho ✅) **NO la invalida**: cualquiera que haya clonado/forkeado el repo, o que acceda al historial, sigue teniendo una key con `role: service_role` y `exp: 2092300497` (año 2036).
- La `service_role` **bypasea TODA la RLS**. Mientras no se rote, **el excelente trabajo de RLS documentado en `docs/SECURITY.md` queda anulado** para quien tenga la key: acceso de lectura/escritura total a la base de producción de todos los clubs.

> **La RLS no protege nada frente a la key filtrada hasta que se rote. Rotar la key es la acción #1 y es responsabilidad del dueño (no se puede hacer desde el código).**

---

## ✅ Arreglado en código (esta remediación)

| # | Hallazgo (ref. auditoría) | Acción | Estado |
|---|---|---|---|
| 1 | §3 — `service_role` hardcodeada en `tests/` | Reemplazada en los **12 archivos** por `requireEnv('SUPABASE_SERVICE_ROLE_KEY')`, con un helper que **aborta con error claro** si la variable falta. Cero valores de key en el working tree. | ✅ |
| 2 | §3/§5 — `anon` key hardcodeada en tests | En `smoke_full.mjs` y `smoke_t9_t16.mjs` la `anon` key pasó a `requireEnv('SUPABASE_ANON_KEY')` (la anon es pública, pero se unifica el patrón). | ✅ |
| 3 | §3/§5 — sin `.gitignore` de secretos | `.gitignore` ahora ignora `.env`, `.env.*`, `*.key`, `*service*account*.json`. | ✅ 📄 |
| 4 | §6 — XSS por `innerHTML` con datos de usuario | Helper `escapeHtml()` agregado y aplicado en los **sinks que interpolan datos tipeados por el usuario** (nombres, apellidos, observaciones, documentos, teléfonos, emails, notas, descripciones, nombres de catálogos compartidos). | ✅ |
| 5 | §6 — CSS injection vía `color_hex` | En `categorias.html`, `color_hex` se valida con `safeColor()` (regex `#rrggbb`) antes de ir a `style="background:…"`. | ✅ |
| 6 | §6 — URLs de imagen sin sanitizar | En `caballerizas.html`, `chaquetilla_url` pasa por `encodeURI()` antes de ir a `<img src>`. | ✅ |
| 7 | §6 — sin defensa en profundidad contra XSS | Meta `Content-Security-Policy` agregada en las **29 páginas de producción** (ver §CSP). | ✅ |
| 8 | §3 — docs de tests desactualizados | `tests/README.md` actualizado: ahora documenta el uso por variables de entorno y advierte de no commitear nunca la `service_role`. | ✅ 📄 |

### Sobre los `innerHTML` (criterio aplicado)

La auditoría reporta ~200 usos de `innerHTML`. **No se tocaron todos a ciegas.** Se aplicó `escapeHtml()` solo donde se interpola **dato de origen-usuario** dentro de HTML. Páginas endurecidas en esta pasada:

- `spcs.html` — nombres de SPC, registro stud book, caballerizas, entrenadores, propietarios.
- `jockeys.html` — nombre/apellido, matrícula, documento, teléfono, categoría.
- `profesionales.html` — nombre/apellido, patente, documento, teléfono, email.
- `caballerizas.html` — nombre, descripción de chaquetilla, teléfono, notas + URL de imagen vía `encodeURI`.
- `propietarios.html` — nombre, documento, domicilio, localidad, stud, teléfono, email, descripción de colores.
- `categorias.html` — nombre, código, símbolo + `color_hex` validado.
- `hipodromos.html` — nombre, sigla, tipo de pista, localidad, provincia.
- `carta-llamados.html` — el `escapeHtml` preexistente se endureció (maneja `null`/`undefined`, escapa también comillas).

`auditoria.html` ya tenía un `escapeHtml` robusto y bien aplicado — no se modificó.

> Las páginas de resultados/liquidaciones/programa (`resultados.html`, `liquidaciones.html`, `ratificacion.html`, `programa*.html`, `inscripciones.html`, `portal.html`, etc.) interpolan mayormente datos numéricos/calculados o ya escapados; **no se forzó escaping ahí para no arriesgar la lógica de negocio** (motor de liquidaciones / dividendos). Quedan como revisión recomendada de segunda pasada (⏳), priorizando cualquier sink que reciba `observaciones`, `nombre`, o catálogos compartidos.

### CSP aplicada

Meta tag insertada tras `<meta charset>` en las 29 páginas (se excluyeron los `mockup-*.html`, que son maquetas estáticas):

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net;
style-src  'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src   'self' https://fonts.gstatic.com;
img-src    'self' data: blob: https://*.supabase.co https://raw.githubusercontent.com;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

**Por qué `'unsafe-inline'` en `script-src`:** la app tiene ~267 manejadores `onclick=` inline y todo el JS va en `<script>` inline. Sin `'unsafe-inline'` la app se rompe entera. Aun así la CSP aporta defensa real: restringe `connect-src` (solo Supabase), bloquea orígenes de script desconocidos, bloquea `<object>`/plugins, fija `base-uri`/`form-action`, e impide el framing.

> **Limitación conocida:** GitHub Pages no permite headers HTTP personalizados, por eso la CSP va en `<meta http-equiv>`. En meta-tag, la directiva `frame-ancestors` es ignorada por el navegador (solo funciona como header HTTP); se dejó igual porque no hace daño. Para CSP por header real (incluido `frame-ancestors` y HSTS) habría que poner un CDN/proxy delante (Cloudflare) — ⏳ del dueño.
>
> **Verificar tras deploy:** abrir cada página con la consola del navegador y confirmar que no hay violaciones de CSP (especialmente fuentes de Google y el bundle de Supabase desde jsDelivr). Si alguna falla, ajustar el origen en la directiva correspondiente.

---

## 📄 Archivos entregados / modificados

**Nuevos:**
- `docs/auditoria/SGH-REMEDIACION.md` (este documento)

**Modificados — código:**
- `.gitignore`
- `tests/README.md`
- `tests/smoke_full.mjs`, `tests/smoke_t9_t16.mjs`
- `tests/probe_dividendos_inline.mjs`, `tests/probe_estado_pista.mjs`, `tests/probe_fase2_liquidaciones.mjs`, `tests/probe_modelo_chapa.mjs`, `tests/probe_nav_dirty.mjs`, `tests/probe_no_largo.mjs`, `tests/probe_propietario_derivacion.mjs`, `tests/probe_spcs_caballeriza.mjs`, `tests/probe_tiempo_ganador.mjs`, `tests/probe_vacante_vac.mjs`
- HTML con escaping/sanitización: `spcs.html`, `jockeys.html`, `profesionales.html`, `caballerizas.html`, `propietarios.html`, `categorias.html`, `hipodromos.html`, `carta-llamados.html`
- HTML con CSP (29): `admin.html`, `auditoria.html`, `caballerizas.html`, `calendario.html`, `carta-llamados.html`, `categorias.html`, `hipodromos.html`, `index.html`, `inscripciones.html`, `jockeys.html`, `liquidaciones.html`, `login.html`, `portal.html`, `profesionales.html`, `programa-oficial-color.html`, `programa-oficial.html`, `programa.html`, `propietarios.html`, `ratificacion.html`, `registro-profesional.html`, `registro.html`, `reset-password.html`, `resoluciones.html`, `resultados.html`, `resultados_legacy.html`, `reuniones.html`, `sanciones.html`, `spcs.html`, `usuarios.html`

### Verificación de sintaxis

- **Todos** los `tests/*.mjs`: `node --check` ✅ (12/12).
- **Todas** las páginas de producción: `<script>` extraído y `node --check` ✅ (29/29).
- Confirmado: cero literales de la `service_role`/`anon` key en el working tree (`grep` = 0).

---

## ⏳ Pendiente del dueño (NO se puede hacer desde el código)

### 1. Rotar la `service_role` key en Supabase — **URGENTE, hacelo primero**

Esto **invalida la key filtrada** (la del historial deja de servir). Mientras no lo hagas, la RLS está anulada para quien tenga la key vieja.

1. Entrá al dashboard: **https://supabase.com/dashboard/project/unlhcuanfrtpatoipwve**
2. **Settings → API → Project API keys**.
3. Rotá/regenerá la **`service_role`** key (botón de reset/rotate). Opcional pero recomendado: regenerá también la `anon` si querés cortar todo de raíz (implica re-emitir el JWT secret).
4. Guardá la nueva key **fuera del repo** (gestor de secretos / `.env` local que ya está en `.gitignore`).
5. Para correr los tests, exportá las variables antes de ejecutar:
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY='LA_NUEVA_SERVICE_ROLE'
   export SUPABASE_ANON_KEY='LA_ANON'
   node tests/smoke_full.mjs
   ```
   Si falta alguna, el test **aborta con error claro** (no usa ningún valor por defecto).

### 2. Purgar la key del historial de git

La key sigue en **142 commits** del historial aunque ya no esté en el working tree. Purgala **después** de rotarla.

> Backup primero: `git clone --mirror git@github.com:mdqclio/SGH.git SGH-backup.git`

**Opción A — `git filter-repo` (recomendada):**
```bash
# instalar: pipx install git-filter-repo   (o: pip install git-filter-repo)
cd /home/clio/dev/SGH

# 1. archivo con el/los secretos a reemplazar en TODO el historial
cat > /tmp/secrets.txt <<'EOF'
<PEGAR_SERVICE_ROLE_JWT_REVOCADA_AQUI>==>SUPABASE_SERVICE_ROLE_KEY_PURGED
EOF

# 2. reescribir el historial reemplazando el valor por un placeholder
git filter-repo --replace-text /tmp/secrets.txt --force

# 3. re-agregar el remote (filter-repo lo borra por seguridad) y forzar push
git remote add origin git@github.com:mdqclio/SGH.git
git push origin --force --all
git push origin --force --tags
```

**Opción B — BFG Repo-Cleaner:**
```bash
# descargar bfg.jar de https://rtyley.github.io/bfg-repo-cleaner/
echo '<PEGAR_SERVICE_ROLE_JWT_REVOCADA_AQUI>' > /tmp/secrets.txt   # valor real (ya revocado) lo pega el dueño al correr la purga
git clone --mirror git@github.com:mdqclio/SGH.git SGH.git
java -jar bfg.jar --replace-text /tmp/secrets.txt SGH.git
cd SGH.git && git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force
```

> **Importante:** el `--force-push` reescribe historia compartida. Coordiná con cualquier otra persona que tenga clones (deben reclonar). En GitHub, los commits viejos pueden persistir en la API/forks: tras purgar, **abrí un ticket de soporte de GitHub** pidiendo limpiar referencias colgadas si el repo es público o tuvo forks. Aun así, la mitigación real es la rotación del paso 1 — purgar el historial es defensa secundaria.

### 3. Confirmar que ningún test depende del valor viejo

Ya está garantizado por el código (`requireEnv` aborta si falta la env var), pero verificá:
```bash
cd /home/clio/dev/SGH
# 0 resultados = ok
grep -rn "drl2zQmZ3NMEksHSv14Jd\|rKb8BI7fBQcRdyyyxVfBOZbt" tests/
# correr un smoke con la NUEVA key exportada
export SUPABASE_SERVICE_ROLE_KEY='...'; export SUPABASE_ANON_KEY='...'
node tests/probe_estado_pista.mjs   # debe autenticar/operar con la key nueva
```

### 4. Otros bloqueantes de la auditoría (fuera del alcance de esta remediación)

| Ref. | Pendiente | Acción sugerida |
|---|---|---|
| §5 | Base de **staging** separada | Crear proyecto Supabase de staging; los tests pegan ahí, no a prod. |
| §7 | **Rate limiting** | Límite por IP en login y escrituras (Supabase Auth config + proxy/Edge Function + protección CDN). |
| §10 | **Monitoreo / alertas** | Error tracking (Sentry) y alertas de caída, con foco en el motor de liquidaciones. |
| §2 | Check anti `USING(true)` | Test automatizado que falle si queda una policy `USING(true)` residual en prod. |
| §6 | Header CSP/HSTS real | CDN/proxy (Cloudflare) delante de GitHub Pages para servir headers de seguridad. |

---

## Resumen de estado

| Tema | Antes | Después de esta remediación |
|---|---|---|
| `service_role` en working tree | 🔴 hardcodeada en 12 archivos | ✅ por env var, falla si falta |
| `service_role` en historial git | 🔴 en 142 commits | ⏳ pendiente purga (dueño) — **rotar primero** |
| Key válida en Supabase | 🔴 sí, exp. 2036 | ⏳ **rotar (dueño) — sin esto la RLS sigue anulada** |
| `.gitignore` de secretos | 🔴 inexistente | ✅ agregado |
| XSS en sinks de datos de usuario | 🟡 sin escaping | ✅ `escapeHtml` en páginas CRUD principales |
| CSP | 🔴 ausente | ✅ meta CSP en 29 páginas (con `'unsafe-inline'` necesario) |
| Rate limiting / monitoreo / staging | 🔴 | ⏳ pendiente (dueño) |
