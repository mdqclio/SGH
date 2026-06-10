# SGH — Estado del Deploy

> Doc único: estado vivo + log de snapshots. El snapshot más nuevo va arriba.

---

## 📸 Snapshot 2026-06-10 — el más nuevo

> Autoritativo. Supera a los snapshots de abajo. Main == origin/main tras merge no-ff `feat/fase5-resumen` (`4cc6c27`).

### Liquidaciones — Fase 5 Resumen de reunión VIVO (v1, read-only)
- **Pestaña "📊 Resumen"** en `liquidaciones.html` junto a Pagos (selector propio). Agrega `liquidacion_detalle` por estado para la reunión: **Total / Pagado (+N recibos) / Pendiente (impago) / Retenido (anti-doping) / Fondo solidario (club, 2%)**. Reconciliación `pagado+impago+retenido+fondo=total`. Lista de **pendientes por beneficiario** (impago/retenido, orden desc), agrupada igual que Pagos (sub-roles bajo el entrenador). **Read-only, no escribe.**
- Probe throwaway reconcilió OK (diff 0.00), restaurado sin residuo → Dolores en 0 liquidaciones.
- **Pendientes (sin cambio):** **v1.2 tabla de autorizados** (ISSUE-028 — branch `feat/apoderados-v1` en review, no mergeada); **backfill propietarios** (`inscripciones.propietario_id` 10/95, `spc_propietarios` 0); **turno→carrera en el recibo** (ISSUE-029, parkeado). → **Fase 5 ya NO es pendiente.**

---

## 📸 Snapshot 2026-06-09 (cierre de sesión) — superado por el de arriba

> Superado por el snapshot 2026-06-10. Main == origin/main, todo pusheado + deploy verificado en prod.

### Liquidaciones / Pagos — pulido de recibo + 2bis oficializar carrera
- **Recibo de Pagos (final):** imprime **2 copias idénticas** por hoja con rótulo **ORIGINAL / DUPLICADO**; **logo precargado** antes de `print()` (fix de timing); **firma anclada al pie** de cada página; sin CUIT/Tel; bloque firma/aclaración/DNI. Commits `40981c9`, `55c43b7`, `5eecf72`.
- **Limpieza:** borrado el **recibo de liquidación vestigial** + botón **Marcar pagada**; sacados botón **Aprobar** + `cambiarEstado()` muerta; quitada la **captura de cobrador** en Pagos. Commits `f67402e`, `40087ae`.
- **2bis — oficializar/des-oficializar CARRERA VIVO:** botón oficializar/des-oficializar a nivel carrera + **motor de liquidación paid-safe** (no re-liquida líneas ya pagadas). Merge `cc71c64` (`0cbb587`). → reemplaza el "2bis oficializar reunión" que figuraba pendiente.
- **RPCs vivas en DB:** sin cambio (`fn_siguiente_recibo`, `emitir_recibo` v1.1, `liberar_linea`).
- **Pendientes (sin cambio):** **v1.2 tabla de autorizados** (ISSUE-028); **Fase 5 resumen de reunión**; **backfill propietarios** (`inscripciones.propietario_id` 10/95, `spc_propietarios` 0); **turno→carrera en el recibo** (ISSUE-029, parkeado).

---

## 📸 Snapshot 2026-06-08 (cierre de sesión) — superado por el de arriba

> Superado por el snapshot 2026-06-09. Supera al snapshot de arranque de abajo.

### Liquidaciones / Pagos — Fase 4 VIVO en main/prod
- **Generación (Fase 0-2 + C):** reparto por config, fondo solidario, bono ganador (al 1°, por roles), bono 6-8 (100% propietario), **incentivos** (jockey 50k/reunión dedup, entrenador 10k/caballo — merge `47362ef`), retención automática 1°/2° (Fase C).
- **Fase 4 — Pagos/recibos VIVO:**
  - **v1** (merge `1a50359`): tab "🧾 Pagos", buscador por persona/caballeriza, detalle pagable cruzando reuniones, RPC `emitir_recibo` (número correlativo + recibo + marcado atómico), print.
  - **v1.1** (merge `4851129`): **liberación del doping = MANUAL** — `emitir_recibo` pagable solo `impago`; RPC `liberar_linea` (retenido→impago) con botón Habilitar; filtro por carrera; búsqueda por nombre/apellido/DNI.
  - **Recibo:** logo del club (`clubs.logo_url`) en membrete a la izquierda + firma sin recuadro (`6d1ed11`, `154c83e`).
- **RPCs vivas en DB:** `fn_siguiente_recibo`, `emitir_recibo` (v1.1), `liberar_linea`.
- **Pendientes:** **v1.2 tabla de autorizados** (autorizante→autorizado para cobrar por otro); **Fase 5 resumen de reunión**; **2bis oficializar reunión**; **backfill propietarios** (`inscripciones.propietario_id` 10/95, `spc_propietarios` 0); **turno→carrera en el recibo** (mostrar nº de carrera de programa, parkeado).
- **Reglas Fede confirmadas hoy:** ver `docs/LIQUIDACIONES_MODELO.md` (incentivos, bonos, retención + liberación manual, recibo, autorizaciones).

### Otros (sin cambio esta sesión)
- E1 caballeriza-obligatoria NEUTRALIZADA en main (`7af005c`); Fix D vivo (`ccef143`). Backfill = reactivar E1.
- Fix UI: `.modal` top-align (`a1565cd`).

---

## 📸 Snapshot 2026-06-08 (arranque de sesión) — superado por el de cierre (arriba)

> Verificado contra repo/DB/git el 2026-06-08. Lo no confirmado va marcado **(sin confirmar)**.

### Entorno / infra
- Claude Code corre en **VPS Hetzner** (`ubuntu-8gb-fsn1-1`, fsn1), Ubuntu **26.04 LTS** "resolute",
  4 vCPU, 7.6 GiB RAM, 150 G disco, node v22.22.1. Repo en **`/home/clio/dev/SGH`**.
  Acceso: VS Code Remote-SSH + Terminal nativa desde una MacBook Air. **Ya NO es Codespaces.**
- **Sin browser:** Playwright/chromium no corre en Ubuntu 26.04 → verificación de flujos con harness
  de código real (AsyncFunction + Supabase real + stubs DOM; snapshot→run→assert→restore). Ver `docs/SERVER.md`.
- **Relevo por `.md`:** el copy de terminal no es confiable → CC escribe a `.md` y pushea; el asesor lee de `raw.githubusercontent.com`.

### Seguridad (remediación 2026-06-07)
- Keys legacy (`eyJ...` anon + service_role) **DESHABILITADAS** (401 "Legacy API keys are disabled"). Rotado a:
  **publishable** (`sb_publishable_...`, frontend, en los HTML) + **secret** (`sb_secret_...`, server-side, `.env` del VPS gitignore como `SUPABASE_SECRET_KEY`, nunca en git).
- JWT **HS256 revocado → ECC P-256** **(sin confirmar in situ — documentado en la remediación)**.
- PAT comprometido revocado; PAT **`claude-code-mcp`** activo (lo usa el Supabase MCP).
- **FASE 3** (policies de catálogos permisivos) **diferida**. **leaked-password protection: PENDIENTE** (toggle manual en dashboard — acción del dueño).
- Docs: `docs/SECURITY.md`, `SECURITY_AUDIT.md`, `REMEDIACION_RESULTADO.md`.

### Liquidaciones
- **Modelo CERRADO:** `docs/LIQUIDACIONES_MODELO.md`. **Gap analysis (en main):** `docs/LIQUIDACIONES_GAP_ANALYSIS.md`.
- **VIVO en main/prod:** Fase 0 (schema), Fase 1 (config por club), Fase 2 (fondo solidario 2% + bono 6-8 100% propietario + incentivos) — merge `ccef143`; **Fase C** (estado_linea + retención anti-doping 1°/2°) — `7e638c7`. → §1-6 + §8 del modelo = **7/9**.
  - Fase C: premio 1°/2° → `retenido` + `fecha_liberacion = reuniones.fecha + dias_antidoping` (30); NOTA-A: subs `actuacion` acompañan; NOTA-B: reunión sin fecha → retenido + warn; resto `impago`. Verificada real-code `tests/probe_fase_c.mjs` (11/11). Ver `docs/RESULTADO_FASE_C.md`, `docs/PLAN_FASE_C.md`.
- **Faltan (al arranque; §7 recibo YA hecho en el cierre):** §9 resumen de reunión. Ver snapshot de cierre arriba.
- **Bloqueante de datos (Fase A):** `inscripciones.propietario_id` **10/95** (85 NULL); `spc_propietarios` **0**. Sin dueño no se liquida propietario ni bono 6-8 (GOTCHA #47). Backfill bloqueado por dato/Fede.
- **Pendiente de Fede:** mapping SPC→propietario; montos incentivo jockey/entrenador (hoy 0 → no se generan); regla de liberación anti-doping (¿auto 30d o gated por doping? **(sin confirmar)** — hoy auto).
- **Fases siguientes (estado al cierre):** **C ✅** · **4 recibos ✅ (v1+v1.1)** · pendientes: A backfill, 2bis oficializar, 5 resumen, 6 validar R5, v1.2 autorizados.

### Ratificación
- **E1 caballeriza-obligatoria NEUTRALIZADA en main** (commit `7af005c`, hard-block removido en 3 sitios de `ratificacion.html`; motivo: que Fede pueda ratificar sin caballeriza obligatoria mientras falta el backfill). Gate de **jockey** sigue activo. Reactivar = backfill SPC→caballeriza + `git revert 7af005c` con Fede avisado.
- **Fix D (captura de caballeriza en `spcs.html`, `f-caballeriza-form`/`f-sexo-form`) VIVO en main** (`ccef143`, ISSUE-026 resuelto).

### Pendiente operativo (decide el dueño)
- Liquidaciones ya generadas en prod siguen en `impago` hasta regenerarlas. **No regenerar por cuenta propia.**
- R5 tiene 3 líneas en `retenido` dejadas por la verificación UPDATE previa a Fase C (no de una regeneración real); se pueden volver a `impago` con un UPDATE puntual si se decide.

### Git
- `main` con Fase C + gap analysis + doc-sync mergeados (`eb89d54` y posteriores) y desplegado en GitHub Pages.

---

## Producción: https://mdqclio.github.io/SGH/

## Funcionando correctamente
- Login y recuperación de contraseña
- Dashboard con calendario y estadísticas
- Panel admin para gestión de hipódromos
- Alta de nuevos hipódromos (registro.html)
- Reuniones: CRUD con 7 estados
- Carta de llamados: turnos, bonos, premios, publicar/bloquear
- Inscripciones: buscador SPCs, jockey titular/suplente, peón/capataz/sereno, estado mal_inscrito, marcar carrera reabierta/anulada. Header compacto, dropdown Estado inline, contador inscriptos.
- PDF inscriptos estilo Palermo: CSS columns 4-col, bloques por turno, condición abreviada, banda REABIERTA, lista alfabética con (H) y ●, matriz consolidada ORDEN DE LARGADA al pie. 2 páginas A4 landscape.
- Ratificación (ratificacion.html) — feature-complete (15/05/2026):
  - Columnas separadas: SPC | Caballeriza | Jockey | Peso | Estado | Acciones
  - Jockey editable inline: select con suplente como primera opción, XX en rojo si NULL, save on change, actualiza botón Ratificar sin re-render
  - Tercer estado `mal_inscrito`: botón ⚠, modal compartido con forfait, badge naranja, excluido del contador de activos
  - Barra de navegación por turnos: botones numéricos, click expande + colapsa otros + scroll suave
  - Validación bloqueante al ratificar: requiere jockey_titular_id
  - Cierre por hora: campo `reuniones.hora_cierre_ratificacion TIME DEFAULT '12:00:00'`. Badge ABIERTA/CERRADA. Cuando cerrada: UI read-only completa.
  - Congelamiento de peso: al cargar reunión cerrada, copia peso_declarado → peso_final para ratificadas sin peso_final
  - Alerta de colisión de jockey: filas con mismo jockey en carrera se marcan ⚠ dup. (visual, no bloqueante)
  - `motivo_forfait` renombrado a `motivo_estado` en DB y frontend (inscripciones.html, portal.html, ratificacion.html)
- Programa hípico (programa.html) — Bloque D sub-tanda 1 completa (15/05/2026):
  - Solo inscripciones ratificadas. Columnas: # | SPC | Caballeriza | Propietario | Entrenador | Jockey | Peso | Últimas 5 performances
  - Header con logo (si existe), nombre hipódromo, número y fecha de reunión
  - Condiciones crudas por carrera (sin composer — D.2)
  - Bolsa y distribución de premios por puesto
  - CSS @media print A4 landscape. Pendiente: D.2 (composer), D.3 (logo configurable), D.4 (postponed/H)
- Stud Book, profesionales, jockeys, propietarios, caballerizas (con modelo relacional de responsables)
- Sanciones compartidas, resoluciones
- Gestión de usuarios por hipódromo
- Calendario anual de reuniones
- PWA instalable
- **Admin "Mi Hipódromo"** (19/05/2026): ABM de Comisión de Carreras, Sponsors y Comisariato (club-level). Campos disclaimer_importante, disclaimer_nota, redes sociales (website/instagram/facebook/tiktok/twitter_x/youtube). Rol admin-de-hipódromo puede editar sus propios datos (no requiere super_admin).
- **Carta de llamados** (19/05/2026): rediseño completo del PDF estilo Dolores — cajas de carrera con caption de categoría, bono inline en rojo, bloques de novedades editables (textarea con auto-save), disclaimers, fechas operativas, secretaría con redes sociales, logos de sponsors.
- **"No corrió" en `resultados.html`** (28/05/2026 — feat/no-corrio-v3): botón NC por caballo ratificado en el marcador. Al guardar (F10), los marcados se persisten con `{posicion:null, no_largo:true}` en `resultado_posiciones`. Mandil conservado (hueco). Deducción automática si quedan caballos sin resultado al guardar. Schema: `posicion` nullable + columna `no_largo` ejecutadas en prod. RPC `aplicar_resultado` actualizada. Probe: `tests/probe_no_largo.mjs`. End-to-end verificado en prod.
- **Apuestas por carrera — tabla relacional** (27/05/2026): tabla `carrera_apuestas` (reemplaza `carreras.apuestas_habilitadas JSONB`). Modal 🎯 Apuestas en programa.html con checkbox + precio + nombre + asegurado/incremento por carrera. 13 tipos válidos: GAN, SEG, TER, EX, IM, TR, CUAT, X2, X2P, X3, X4, X5, CAD. Guardado bulk vía Promise.all.
- **Reunión activa centralizada** (19/05/2026 → helper 20/05/2026): `sgh_active_reunion_id` en localStorage. Refactorizado a `active-reunion.js` helper global `window.ActiveReunion` aplicado en 6 pantallas (programa, carta-llamados, inscripciones, ratificacion, resultados, liquidaciones). Fijable desde reuniones.html con botón 📍 Activar.
- **Selector de hipódromo para super_admin** (20/05/2026): `club-switcher.js` inyecta dropdown en el topbar de las 16 pantallas operativas/de gestión. Persiste en `sgh_selected_club_id`. Al cambiar de hipódromo borra `sgh_active_reunion_id` para evitar apuntar a reunión de otro club. Excluye login/registro/index (index ya tiene su propio selector).
- **Bug alta de hipódromos** (20/05/2026): corregido INSERT de categorías por defecto que usaba tabla `categorias` → `categorias_carrera`. Backfill aplicado para hipódromos existentes sin categorías.
- **Premio mínimo unificado** (20/05/2026): eliminada columna huérfana `premio_minimo` en liquidaciones. Unificado en `distribucion_premios.ganancia_minima` que ya existía.
- **Programa Oficial Fases 4.1–4.3** (20/05/2026): nueva página `programa-oficial.html` standalone para impresión. Estilo newsprint B&N, tipografía EB Garamond/Inter. Header comisión/comisariato/logo. Bloque por carrera con tabla 8 columnas (CABALLERIZA, 4 ULT.PERF., N°, SPC, JOCKEY, KESP, PADRE-MADRE, ENTRENADOR). Sponsors grid B&W, banner próxima reunión, sponsor destacado a media página (foto + datos). Secretaría y teléfono de inscripciones en el pie. Paginación @page Chrome/Edge. Accesible desde botón 📘 en programa.html.
- **Campo ult_performances en SPCs** (20/05/2026): `spcs.ult_performances TEXT`, editable desde el modal de edición en tab Origen. Celda en blanco si no hay datos.
- **RLS multi-tenant por club_id** — 26 tablas endurecidas, aislamiento cross-club verificado, ISSUE-017 cerrado (14/05/2026)
- **Sistema de auditoría** — UI completa con paginación, filtros, diff visual, export CSV (12/05/2026)

## En desarrollo
- Resultados: rediseñado — pendiente testing manual end-to-end por Fede. Ver bugs conocidos en ISSUES.md (ISSUE-020 al 025).
- Liquidaciones: **Fase 1+2+C + Fase 4 (Pagos/recibos) vivas en main/prod** (ver snapshot 2026-06-08 arriba y ISSUE-001 / `docs/LIQUIDACIONES_GAP_ANALYSIS.md`). Pendientes: A (backfill propietarios, bloqueada por dato/Fede), 2bis (oficializar reunión), 5 (resumen de reunión), 6 (validar R5), v1.2 (autorizados).

## Pendiente de construir
- Portal propietarios/entrenadores (portal.html)
- Auto-registro de profesionales (registro-profesional.html)
- API con Stud Book nacional (en gestión de acceso)
- Emails automáticos (pendiente Resend/SendGrid)
- Cargar datos de sponsor destacado, secretaría y teléfono en Admin → Mi Hipódromo para Dolores
- Programa Oficial Fase 4.4: página de combos (Triplo, Cuaterna, Doble) — bloqueada hasta confirmar modelo de apuestas combinadas con Fede
- Confirmar con Fede el formato exacto de K E S P (asumido como Kilos/Edad/Sexo/Pelaje, códigos Z/T/A/C/N/M)

## Clientes activos
| Hipódromo | Sigla | Estado | club_id |
|---|---|---|---|
| Hipódromo de Dolores | HDO | Piloto activo | 0649e9c5-9e87-4aad-842f-101458e6b33c |

## Datos cargados en Dolores (sesión may-2026)
- 5 reuniones (enero-mayo 2026)
- 11 carreras en reunión 5
- 7 jockeys (Dolores)
- 77 entrenadores (Dolores)
- 201 caballerizas
- 219 responsables de caballerizas (38 vinculados con profesional_id por DNI matching, 16 copropiedades)
- SPCs y entrenadores de prueba cargados

## Datos de validación PDF (reunión 5 Dolores — may-2026)
- Los 11 turnos poblados con ~81 inscripciones en total (distribución random)
- Turno 1: 11 inscriptos, condicion_sexo='ambos', nombre='Premio Apertura'
- Dourada: sexo='hembra' para validar el indicador (H) en carrera mixta
- Todos los inscriptos de turno 1: certificado_correr=false (validación del ●)
- numero_partidor asignado aleatoriamente 1-16 por carrera, sin repetir dentro de la misma carrera
- hipodromos.cantidad_gateras = 16 para Dolores (cargado por SQL)

## Limpieza pendiente (datos de prueba en Dolores)
- 9 caballerizas extra detectadas
- 14 profesionales extra detectados
- 7 propietarios de prueba detectados
- Todos identificados pero no borrados (esperar UI de baja)

- **Vista Reducida / Vista Detallada de dividendos** (27/05/2026): `resultados.html` rediseñado estilo papel. Eliminada grilla editable. Vista Reducida: GAN/SEG/TER en 3 columnas con chapas SBARG color + monto en cápsula. Vista Detallada: posicionales + Apuestas directas (EX/IM/TR/CUAT con composición auto-computada via chips) + Apuestas combinadas (X2/X2P/X3/X4/X5/CAD). Ambas vistas usan `renderDivHTML()` compartido.
- **Modal "Div. habilitadas"** (27/05/2026): carga de dividendos por tipo habilitado en carrera. Posicionales GAN/SEG/TER con chapa SBARG + input de dinero en 3 columnas. Directas y combinadas en lista vertical.
- **Botón "Pesos balanza"** (27/05/2026): modal en `resultados.html` que muestra inscripciones ratificadas, permite cargar `inscripciones.peso_balanza` NUMERIC(5,2) (peso del caballo en balanza post-carrera, rango 300–600 kg).
- **renumerar-chapas.js** (27/05/2026): helper centralizado `renumerarChapas(inscripciones)` — filtra `estado === 'ratificado'`, ordena por `numero_partidor` ASC, devuelve `{id → 1..N}`. Aplicado en 7 call sites corrigiendo bug de chapa 16.
- **Terminología visual** (27/05/2026): "Combinatoriales" → "Apuestas directas", "Multi-carrera" → "Apuestas combinadas". Códigos internos sin cambio.
- **Cosméticos resultados.html** (27/05/2026): "Turno N" → "Carrera N", subtítulo solo distancia, labels M.(F) y (MANDIL) removidos, "Sport" → "Div a GAN".
- **formatARS / parseARS / bindARSInput** (27/05/2026): formato argentino para todos los inputs y displays de dinero en `resultados.html` (punto miles, coma decimal, 2 decimales fijos).

---

## Snapshot — 28/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Completado en esta sesión**:
- `feat/no-corrio-v3` mergeada a `main` y desplegada en prod.
- Schema ejecutado en prod vía MCP: `posicion` nullable + columna `no_largo BOOLEAN NOT NULL DEFAULT false`.
- RPC `aplicar_resultado` actualizada: INSERT de `resultado_posiciones` incluye `no_largo`.
- End-to-end verificado en prod: 9 filas (7 con posicion 1..7, 2 con posicion=null y no_largo=true).
- Docs actualizados: CHANGELOG, ESTADO, ISSUES, SCHEMA, MODELO_NUMERACION.

**Próximo paso**: testing manual con Fede en resultados → Bloque C liquidación (montas perdidas, prerequisites ahora cumplidos).

---

## Snapshot — 27/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Validación de Fede**: pendiente en producción — primer ciclo completo con dividendos. Bugs conocidos documentados en ISSUES.md (ISSUE-020 al 025).

**Schema nuevo en esta sesión**:
- `carrera_apuestas` — tabla relacional que reemplaza `carreras.apuestas_habilitadas JSONB`. Una fila por apuesta habilitada por carrera. 13 tipos válidos.
- `carreras.apuestas_notas` TEXT NULL — texto libre para notas de apuestas en el programa oficial.
- `resultado_apuestas` — UNIQUE `(resultado_id, tipo, orden)` agregado; TE removido del CHECK; CUAT agregado.
- `inscripciones.peso_balanza` NUMERIC(5,2) NULL — peso real del caballo en balanza post-carrera.

**Archivos nuevos en esta sesión**:
- `renumerar-chapas.js` — helper centralizado de renumeración de chapas.

**Archivos modificados en esta sesión**:
- `resultados.html` (rediseño completo de dividendos, formatARS, renumerar-chapas, botón pesos balanza, cosmetics)
- `programa.html` (modal apuestas → carrera_apuestas, terminología)
- `programa-oficial.html` (corrección filtro `estado === 'ratificado'`, terminología)
- `programa-oficial-color.html` (corrección filtro `estado === 'ratificado'`, terminología)

---

## Snapshot — 20/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Validación de Fede**: pendiente en producción — primer render del Programa Oficial pendiente con datos reales.

**Schema nuevo en esta sesión**:
- `spcs.ult_performances` TEXT — performances manuales hasta API Stud Book.
- `clubs.secretaria_carreras_nombre` TEXT — nombre de la secretaria para el pie del programa.
- `clubs.inscripciones_telefono` TEXT — teléfono de inscripciones para el pie.
- `clubs.sponsor_destacado` JSONB `{nombre, subtitulo, foto_url, direccion, contacto}` — bloque heroico de publicidad en el programa.

**Archivos nuevos en esta sesión**:
- `active-reunion.js` — helper `window.ActiveReunion` (resolve/set/clear).
- `club-switcher.js` — dropdown de hipódromo para super_admin, inyectado en 16 páginas.
- `programa-oficial.html` — vista de impresión estilo manual de Dolores.

**Archivos modificados en esta sesión**:
- `spcs.html` (campo ult_performances)
- `programa.html` (botón 📘 Programa Oficial + función abrirProgramaOficial)
- `admin.html` (secciones Secretaría e inscripciones + Sponsor destacado en modal Mi Hipódromo)
- `carta-llamados.html`, `inscripciones.html`, `ratificacion.html`, `resultados.html`, `liquidaciones.html` (active-reunion.js helper)
- 16 pantallas operativas/de gestión (club-switcher.js tag al final del body)

---

## Snapshot — 19/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos). Fijada en localStorage.

**Validación de Fede**: pendiente en producción.

**Schema relevante** (columnas nuevas o eliminadas en esta sesión):
- `clubs.comision_carreras` JSONB DEFAULT '[]' — board del hipódromo.
- `clubs.sponsors` JSONB DEFAULT '[]' — sponsors para carta de llamados.
- `clubs.comisariato` JSONB DEFAULT '[]' — stewards (movido de reuniones a clubs en refactor).
- `clubs.disclaimer_importante`, `clubs.disclaimer_nota` TEXT — textos legales en carta.
- `clubs.website`, `clubs.instagram`, `clubs.facebook`, `clubs.tiktok`, `clubs.twitter_x`, `clubs.youtube` TEXT.
- `reuniones.fechas_inscripciones`, `reuniones.fechas_forfaits`, `reuniones.fechas_compromiso_montas` TEXT.
- `carreras.apuestas` TEXT[] DEFAULT '{}' — apuestas habilitadas por carrera.
- `carreras.numero_carrera_programa` INTEGER — orden post-ratificación.
- ELIMINADAS: `clubs.apuestas_simples`, `reuniones.apuestas_combinadas`, `reuniones.comisariato`.

**Archivos modificados en esta sesión**:
- admin.html (ABM comisión, sponsors, comisariato, disclaimers, redes; acceso para admin-de-hipódromo)
- carta-llamados.html (rediseño completo PDF, novedades editables)
- programa.html (modal apuestas por carrera, modal comisión read-only, reunión activa en localStorage)
- reuniones.html (hora_cierre_ratificacion, fechas operativas; eliminadas apuestas_combinadas y comisariato)

---

## Snapshot — 16/05/2026 (cierre de sesión)

**Reunión activa**: Reunión 5 — 17/5/2026 — Hipódromo de Dolores (11 turnos).

**Validación de Fede**: pendiente en producción. Sesión cerrada con feature-complete según interpretación de las directivas iterativas (WhatsApp + audios).

**Schema relevante** (estado actual de tablas tocadas):
- `carreras.estado`: nullable, default 'programada'. Valores en uso: NULL/'programada' (ABIERTA), 'confirmada' (CERRADA), 'anulada' (ANULADA), 'reabierta' (legacy, tratado como anulada en algunos lugares).
- `carreras.condicion_adicional`: usado para "Peso del jockey".
- `carreras.numero_carrera_programa`: INTEGER nullable, para asignar orden post-ratificación.
- `carreras.hora_estimada`: TIME nullable.
- `carreras.categoria_id`: FK a `categorias_carrera` (4 cats por club: OC, ONC, NO, CC).
- `reuniones.observaciones`: text, se renderiza en pie del PDF.

**Archivos modificados en esta sesión**:
- ratificacion.html (mayor parte de los cambios)
- carta-llamados.html (label del peso jockey)
- inscripciones.html (estado 'confirmada' en select)
- programa.html (no se tocó hoy)
