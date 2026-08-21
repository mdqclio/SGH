# fix · búsqueda por caballeriza en Pagos (`liquidaciones.html`)

Branch `fix/cobros-busqueda-caballeriza`, salido de `main` en `08c37bb`. **No mergeado.**
Diagnóstico previo: `docs/ES_TITULAR_ROL_DIAGNOSTICO.md` (branch
`chore/propietarios-provisorios-r8`, `7b2da85`).

**Qué arregla:** la resolución caballeriza → propietario titular de `cobrosBuscar()` consultaba
`caballeriza_responsables.es_titular`, **una columna que no existe**. La query fallaba entera
con `42703`, el error se descartaba sin capturarlo, y la lista quedaba vacía. La búsqueda por
caballeriza no encontraba **ninguna** de las 236, no sólo los 40 provisorios de hoy.

---

## El diff

### 1 · `liquidaciones.html` — 3 renglones

```diff
@@ -794,8 +794,9 @@ async function cobrosBuscar(){
   if (error) { toast(error.message,'error'); document.getElementById('cob-beneficiarios').innerHTML=''; return; }
   // caballerizas → propietario titular (para búsqueda por caballeriza)
   if (!cobCaballerizas.length) {
-    const { data: cab } = await sb.from('caballeriza_responsables')
-      .select('propietario_id, caballerizas(nombre)').eq('es_titular', true).not('propietario_id','is',null);
+    const { data: cab, error: eCab } = await sb.from('caballeriza_responsables')
+      .select('propietario_id, caballerizas(nombre)').eq('rol','propietario').eq('activo', true).not('propietario_id','is',null);
+    if (eCab) console.error('[cobrosBuscar/caballerizas]', eCab);
     cobCaballerizas = (cab||[]).map(c=>({nombre:(c.caballerizas?.nombre||'').toLowerCase(), propietario_id:c.propietario_id}));
   }
   const propIdsPorCaballeriza = q ? new Set(cobCaballerizas.filter(c=>c.nombre.includes(q)).map(c=>c.propietario_id)) : new Set();
```

Es lo único que cambia del archivo: **5 líneas tocadas (3 nuevas, 2 borradas) en un solo
bloque**. Ninguna otra función de la pantalla de Pagos se modificó.

### 2 · Documentación

```diff
- docs/RESULTADO_BUSCADOR_LIQUIDACIONES.md:71
-   …se resuelve a su propietario titular vía `caballeriza_responsables(es_titular)`.
+   …se resuelve a su propietario titular vía `caballeriza_responsables`
+   (`rol='propietario'`, `activo=true`).

- docs/RESULTADO_COBROS_V1_1.md:17
-   Caballeriza sigue resolviendo a su propietario titular (`caballeriza_responsables.es_titular`).
+   Caballeriza sigue resolviendo a su propietario titular (`caballeriza_responsables`,
+   `rol='propietario'` + `activo=true`).
```

Tras el cambio, **`es_titular` no aparece en ningún archivo del repo**:

```bash
$ grep -rn "es_titular" --include=*.html --include=*.js --include=*.mjs --include=*.sql --include=*.md .
sin ocurrencias
```

### 3 · `tests/probe_cobros_caballeriza.mjs` — nuevo

Probe de regresión real-code, read-only, registrado en `tests/README.md`.

---

## Verificación

`node tests/probe_cobros_caballeriza.mjs` → **14/14 OK**

El probe **no reimplementa** la lógica: extrae el bloque real de `liquidaciones.html` por su
comentario ancla y lo ejecuta con `new Function` contra la base de producción, igual que
`probe_oficializar_carrera.mjs`. `benefSearch()` también se extrae del archivo, sin copiar.

```
✅ el bloque extraído es el nuevo (rol/activo, no es_titular)
✅ el bloque captura el error (console.error)
✅ a) la query de caballerizas no emitió error
✅ a) devuelve filas                                   → 236 caballerizas
✅ b) LA MILINGA (provisoria de hoy) resuelve a un propietario
✅ c) POR TU CULPA (preexistente) resuelve a un propietario
✅ b) el de LA MILINGA es el provisorio de hoy         → LA MILINGA
✅ c) el de POR TU CULPA es un propietario real        → CIMA, JUAN CARLOS
✅ e) ningún propietario que sea sólo copropietario aparece resuelto
                                                       → 17 sólo-copropietarios, 0 colados
✅ d) benefSearch matchea por apellido de profesional  → Gimenez
✅ d) benefSearch matchea por nombre de profesional    → Roberto
✅ d) benefSearch matchea por DNI de profesional       → [REDACTADO]
✅ d) benefSearch matchea por DNI de propietario       → Leonardo Fernandez
✅ d) benefSearch matchea por nombre de propietario    → Leonardo Fernandez
```

### Lo que pediste, punto por punto

| pedido | resultado |
|---|---|
| **Devuelve resultados** | 236 caballerizas resueltas (antes: 0) |
| **Una de las 40 provisorias** | **LA MILINGA** → propietario `183fb077-…`, con `notas='provisorio R8 15/08'` |
| **Una preexistente** | **POR TU CULPA** → `CIMA, JUAN CARLOS`, sin marca de provisorio |
| **Nombre / apellido / DNI siguen igual** | 5 checks sobre `benefSearch()` real, todos OK |
| **El resto de Pagos no cambia** | el diff toca un solo bloque; `benefSearch`, `cobrosDetalle`, `nombreBenef`, la query de líneas pagables y el filtro por carrera quedan intactos |

### Prueba de sensibilidad — el probe falla sin el fix

Se corrió el mismo probe contra la versión de `main`:

```
❌ el bloque extraído es el nuevo (rol/activo, no es_titular)
❌ el bloque captura el error (console.error)
✅ a) la query de caballerizas no emitió error          ← ⚠️ pasa igual: main se traga el error
❌ a) devuelve filas                                    → 0 caballerizas
❌ b) LA MILINGA … ❌ c) POR TU CULPA …
exit 1
```

**El probe distingue las dos versiones**, así que no está pasando por casualidad.

Y ahí se ve por qué esto sobrevivió: en `main`, el check *"la query no emitió error"* **pasa**
—no porque la query ande, sino porque nadie mira el error—. Con `0 caballerizas` al lado. Ese
contraste es el argumento del tercer renglón.

---

## Alcance y despliegue

- **Sin cambios en la base.** Sólo frontend. `liquidaciones.html` es autocontenido.
- **No se mergeó a `main`**: el branch está pusheado y esperando revisión. Cuando se mergee,
  GitHub Pages lo publica solo (~15-60 s).
- **Riesgo**: bajo. El cambio sólo puede agregar resultados a una lista que hoy está siempre
  vacía; no toca montos, ni emisión de recibos, ni el filtro de líneas pagables.

## Nota de higiene

`.gitignore` de este branch **no tiene** la regla `tmp/bak_r8_*.csv` — vive en
`chore/propietarios-provisorios-r8`. Un `git add -A` acá stagea el CSV del snapshot, que es
**PII**. Se commiteó con lista explícita de archivos; conviene portar esa regla a `main`
cuando se mergee cualquiera de los dos branches.
