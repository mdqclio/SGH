# Tests — SGH resultados.html

Scripts de smoke/integración contra producción (GitHub Pages + Supabase). Usan Playwright headless + Supabase JS admin client.

## Prerequisitos

```bash
cd /workspaces/SGH   # raíz del repo
npm install          # instala playwright y @supabase/supabase-js
npx playwright install-deps chromium
```

Los scripts leen credenciales hardcodeadas (ver sección Seguridad).

## Scripts

### `smoke_full.mjs` — Suite completa T1–T17

Cubre el ciclo completo del turno 6 (DIA DE LA ESCARAPELA):

| Grupo | Tests | Qué verifica |
|-------|-------|-------------|
| Lectura | T1–T4 | 20 filas, celdas M.(F), campo Borrados, screenshot |
| Escritura | T5–T10 | Agregar fila TE, reload verify, cambiar vales, eliminar fila, borrar todo (bug 3b), restaurar |
| Atajos | T11–T13 | F8 recarga desde DB, F10 keyboard persiste, F9 keyboard descarta |
| Concurrencia | T14–T17 | Dos contextos, Ctx A guarda, Ctx B recibe error de conflicto |

```bash
node tests/smoke_full.mjs
```

Duración: ~3-4 minutos. Deja screenshots en `docs/smoke_screenshots/`.

### `smoke_t9_t16.mjs` — Regresión bug 3b + optimistic lock

Versión focalizada para verificar rápidamente los dos bugs críticos corregidos en `carga-resultados-v2`:

- **T9**: borrar todas las filas → F10 → reload → tabla vacía (fix bug 3b)
- **T16**: Ctx A guarda → Ctx B intenta sin recargar → debe recibir toast de conflicto

```bash
node tests/smoke_t9_t16.mjs
```

Duración: ~1 minuto.

## Variables de entorno / credenciales

Los scripts usan credenciales hardcodeadas para el entorno de desarrollo del cliente piloto (Hipódromo de Dolores). No subir a repositorios públicos sin reemplazarlas por env vars.

| Variable implícita | Descripción |
|--------------------|-------------|
| `DOLORES_EMAIL` | Email del usuario de prueba (`dolores@sgh.com`) |
| `SERVICE_KEY` | Supabase service role key (permite `auth.admin.generateLink`) |
| `ANON_KEY` | Supabase anon key |

## Advertencia

**Estos tests pegan directamente a la base de datos de producción.** Cada ejecución:
- Modifica `resultados` y `resultado_apuestas` para el turno de prueba.
- Restaura el dataset original al finalizar (20 filas hardcodeadas en `ORIGINAL_APUESTAS`).
- Genera magic links de autenticación reales.

No ejecutar en CI sin una base de datos de staging separada.
