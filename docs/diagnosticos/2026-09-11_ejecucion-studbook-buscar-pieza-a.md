# studbook-buscar — Pieza A ejecutada: `rpc_spcs_duplicados` + probe 10/10 · espera OK para la Pieza B

**Fecha:** 2026-09-11 (noche) · **`main`:** `4f6ff13` · **Branch:** `feat/studbook-buscar` (pusheada) · **Plan:** `2026-09-11_plan-studbook-buscar-edge-function.md` §2
**Escritura:** `apply_migration rpc_spcs_duplicados` (una función, sin datos). El probe crea y borra 2 usuarios de prueba (teardown verificado por estado).

## 0. Guards

| guard | esperado | real |
|---|---|---|
| `pwd` | `/home/clio/dev/SGH` | ✅ |
| `spcs` | 203 | ✅ (sin cambios) |
| ref | `unlhcuanfrtpatoipwve` | ✅ |

---

## 1. Qué quedó en la base

`public.rpc_spcs_duplicados(p_studbook_id text, p_nombre text, p_fecha_nacimiento date, p_padrillo text, p_madre text)` → `TABLE(motivo, id, nombre, fecha_nacimiento, sexo, color, padrillo_nombre, madre_nombre, studbook_id, estado)`. `plpgsql STABLE SECURITY DEFINER SET search_path = public`. **Guard adentro**: `IF NOT fn_is_staff() THEN RAISE 42501` (GOTCHA #80). `REVOKE … FROM public, anon`, `GRANT EXECUTE … TO authenticated`. Solo lectura: tres `SELECT` en `UNION ALL`, uno por motivo, exactamente la lógica que se corrió a mano en las tres tandas de hoy (`translate` manual porque `unaccent()` no está, GOTCHA #71).

Archivo: `migrations/rpc_spcs_duplicados.sql` (marcado APLICADA). `{"success":true}`.

---

## 2. Probe `tests/probe_rpc_spcs_duplicados.mjs` — 10/10

Sesión real de un **operador** de Dolores (usuario de prueba creado con `auth.admin.createUser` + fila en `usuarios` + magiclink `generateLink`/`verifyOtp`, el patrón de `probe_aislamiento_club_cobros.mjs`), otra de un **profesional** (portal), y el service role a secas. Teardown en el `finally`, verificado por estado en `usuarios` y en `auth.users`.

```
✅ 1) por studbook_id 431567 → LOGUACIOUS  → [{"motivo":"studbook_id","id":"71911106-b45b-4381-b077-41195ee67f81","nombre":"LOGUACIOUS","fecha_nacimiento":"2021-10-23","sexo":"hembra","color":"Zaino","padrillo_nombre":"Le Blues","madre_nombre":"Effervesence","studbook_id":"431567","estado":"activo"}]
✅ 2) por nombre normalizado (minúscula + acento) → LOGUACIOUS  → [{"motivo":"nombre","id":"71911106-b45b-4381-b077-41195ee67f81","nombre":"LOGUACIOUS","fecha_nacimiento":"2021-10-23","sexo":"hembra","color":"Zaino","padrillo_nombre":"Le Blues","madre_nombre":"Effervesence","studbook_id":"431567","estado":"activo"}]
✅ 3) por fecha + padres → CONESERA aunque el nombre sea otro  → [{"motivo":"fecha_padre_madre","id":"1f645327-a6da-449b-8a62-fdb577a8658e","nombre":"CONESERA","fecha_nacimiento":"2023-09-20","sexo":"hembra","color":"Alazan","padrillo_nombre":"Emmanuel","madre_nombre":"Milonga Burrera","studbook_id":"444373","estado":"activo"}]
✅ 4) LOGUARCIUS (typo) + sb + fecha/padres → 2 motivos: fecha_padre_madre + studbook_id, sin "nombre"  → ["fecha_padre_madre","studbook_id"]
✅ 5) inexistente → 0 filas  → []
✅ 6) todo vacío → 0 filas (no barre la tabla)  → 0 filas
✅ 7) usuario de portal → rechazado (42501)  → rpc_spcs_duplicados: solo staff
✅ 8) service role sin usuario → rechazado (auth.uid() NULL)  → rpc_spcs_duplicados: solo staff
✅ T) teardown: 0 usuarios de prueba en `usuarios`  → []
✅ T) teardown: 0 usuarios de prueba en auth

10/10 asserts OK
```

Lo que prueba, contra los casos reales de hoy:
- **1** — `studbook_id` 431567 → LOGUACIOUS (la tercera grafía que ninguna normalización de nombre agarraba).
- **2** — `loguácious` en minúscula con acento → LOGUACIOUS (normalización).
- **3** — la fecha y los padres de CONESERA con **otro nombre** → CONESERA (el caso Conesera/CONESERSA, y el de "mismo animal cargado a mano con otro nombre").
- **4** — `LOGUARCIUS` (typo de planilla) con su `sb_id` y fecha/padres → **2 motivos** (`studbook_id`, `fecha_padre_madre`) y **no** `nombre` — o sea, la pantalla lo va a frenar aunque el nombre esté mal escrito, que es exactamente lo que faltaba en R9.
- **5, 6** — inexistente / todo vacío → 0 filas (no barre la tabla con `p_nombre=''`).
- **7, 8** — portal y service role sin usuario → `rpc_spcs_duplicados: solo staff`.

---

## 3. Siguiente — Pieza B, con tu OK

Edge Function `supabase/functions/studbook-buscar/index.ts` (plan §3): `POST {term}`, `verify_jwt:true` + `getUser` + `fn_is_staff()`, `autocomplete()` copiada del scraper, devuelve `{exactos, parciales, fuente}`, sin secretos, sin DB; cabecera con la nota de "endpoint interno del buscador, no API acordada; cuando exista la de Diego se reemplaza `autocomplete()` adentro sin tocar la pantalla". + probe de la función (extrae `autocomplete` y la clasificación **del archivo**) + deploy.
