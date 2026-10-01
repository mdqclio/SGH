# Portal — traer del Stud Book un caballo que no está en el padrón e inscribirlo de corrido (Fase 1: relevamiento y plan)

- **Fecha:** 2026-10-01
- **Pedido:** Yesi (repetido; caso real en el audio del 01/10 14:10): un entrenador registrado en el portal no pudo
  anotar porque el caballo no estaba en el padrón, y ella lo tuvo que cargar a mano.
- **Decisión ya tomada (no se discute acá):** camino liviano, sin cola de aprobación. El usuario del portal trae el
  caballo del Stud Book, la inscripción queda hecha en el momento y el ejemplar nace **pendiente de revisión**.
- **Alcance:** Fase 1, **SÓLO LECTURA**. Cero escrituras en la base y en `main`. Este informe es lo único que se escribe
  (rama `reports`).
- **Código leído en:** `main` = `cf99bf45abdb990cda55d8f66314081ceb3f85b0` (= `origin/main` al arrancar).
- **Relevamiento previo:** `docs/diagnosticos/2026-09-29_certificado-correr-studbook.md` (reports), §5: "Portal + SPC que
  no está en el padrón: queda trabado".

## Guards

```
pwd                         → /home/clio/dev/SGH
git rev-parse HEAD origin/main
                            → cf99bf45abdb990cda55d8f66314081ceb3f85b0
                              cf99bf45abdb990cda55d8f66314081ceb3f85b0
ref del proyecto (MCP get_project_url) → https://unlhcuanfrtpatoipwve.supabase.co
SELECT count(*) FROM spcs   → 238
```

⚠ **El baseline de `CLAUDE.md` dice 210 y la base tiene 238.** No es proyecto equivocado: son **28 altas legítimas**
de Yesi por `spcs.html` (todas con `studbook_id`, o sea por el buscador del Stud Book) entre el 30/09 01:49 UTC y el
01/10 17:08 UTC — ver §A.5. Es exactamente el síntoma del pedido: la secretaría está cargando a mano los caballos de R10.
Como esta fase es sólo lectura, no bloquea. **Hay que actualizar el baseline en `CLAUDE.md`** (no lo hago: es `main`).

---

## Resumen

1. **Hoy el portal no tiene camino.** El buscador de `portal.html` filtra en memoria el padrón (`rpc_padron_spcs`). Si el
   caballo no está, el usuario **no ve un error**: ve el texto *"Ningún caballo del padrón coincide con esa búsqueda. Si el
   ejemplar existe y no aparece, todavía no está cargado en el sistema: avisale a la secretaría del hipódromo."* y no hay
   botón para seguir. No llega a ningún "Guardar" — el "no pudo guardar" del audio es eso.
2. **Permisos del portal sobre `spcs`:** **lee el padrón completo** (238) por `rpc_padron_spcs` (SECURITY DEFINER, staff o
   portal); por la tabla directa sólo ve lo suyo (`fn_mis_spc_visibles`). **No puede insertar ni actualizar** (`spcs_insert`
   / `spcs_update` exigen `fn_is_staff()`). Un INSERT directo daría `new row violates row-level security policy for table
   "spcs"`.
3. **`studbook-buscar` es sólo staff:** `verify_jwt=true` + `fn_is_staff()` con el JWT del caller → al portal le responde
   **403 `solo_staff`**. Deploy v1 = el archivo del repo.
4. **Campos:** obligatorios en la tabla `nombre`, `fecha_nacimiento`, `sexo` (y `estado` con default `activo`). El Stud
   Book trae los tres. **No hay que inventar nada.** Quedan vacíos `caballeriza_id`, `entrenador_id`, `jockey_habitual_id`,
   `registro_stud_book`, `abuela_materna`, `marcas`, `club_id` (este último es NULL en los 238: el padrón es global).
5. **Marca "pendiente de revisión": no existe.** `estado_spc` no sirve (cualquier valor ≠ `activo` hace que
   `validar_inscripcion` rechace, y la decisión es que inscriba en el momento). Propuesta: columnas nuevas
   `alta_origen`, `alta_por`, `revision_pendiente`, `revisado_por`, `revisado_at`. La secretaría lo ve en **`spcs.html`**
   (chip contador + filtro + badge en la fila + botón "Marcar revisado" en la ficha) y en **`inscripciones.html`** (columna
   "Cargada por", que ya distingue el portal). Sin pantalla nueva.
6. **RPC:** recomiendo que los datos del caballo **no los mande el navegador** sino la Edge Function, que vuelve a pedirlos
   al Stud Book por el `sb_id` elegido; la RPC es SECURITY DEFINER, ejecutable **sólo por `service_role`**, y valida
   usuario, ventana, forma de los datos, duplicados y cupo diario. Detalle de qué valida/rechaza/mensajes en §6.
7. **Concurrencia:** ya existe `spcs_studbook_id_uniq` (único parcial por `studbook_id`). Con `INSERT … ON CONFLICT DO
   NOTHING` + re-lectura, **gana el primero y el segundo reusa la ficha**. No quedan dos.
8. **Probe:** sandbox `tests/local/` para todo lo que crea ejemplares; en prod sólo rechazos y el camino "ya existía"
   (que no escribe). Mutante por regla.
9. **Riesgos:** si el Stud Book cae o cambia, el usuario ve "El Stud Book no responde ahora. Pedile a la secretaría que lo
   cargue." y queda como hoy — nunca peor que hoy.
10. **Hallazgo lateral:** `Wave Rimout` **no es un homónimo**: es el mismo caballo cargado dos veces (Stud Book 397805, una
    sola entrada; las dos filas tienen misma fecha y padres). El comentario de `spcs.html` que lo pone como ejemplo de
    "homónimo legítimo" está equivocado. Afecta el diseño (§6, regla D3).

---

## 1. `portal.html`: cómo inscribe hoy y qué pasa si el caballo no está

### 1.1 Flujo

1. Turnos abiertos → botón del turno → modal `#modal-inscribir` (`portal.html` ~ línea 940).
2. Al abrir el modal se pide el padrón **una vez**: `cargarPadronSpcs()` → `sb.rpc('rpc_padron_spcs')` (`portal.html:735-740`).
3. El usuario tipea en `#minsc-buscar` (`portal.html:270-275`, placeholder "Buscar cualquier caballo del padrón por
   nombre…"). `onBuscarSpc` → `buscarEnPadron` filtra en memoria desde 3 letras, sin acentos (`portal.html:771-806`).
4. Cada resultado tiene botón **Anotar** → `anotar(spcId)` (`portal.html:1052-1118`): exige caballeriza y entrenador
   declarados y llama `sb.rpc('rpc_inscribir', {p_spc_id, p_carrera_id, p_caballeriza_id, p_entrenador_id,
   p_jockey_titular_id, p_jockey_suplente_id})`. El portal **no tiene INSERT sobre `inscripciones`** (la política lo
   excluye: §A.8).
5. `rpc_inscribir` (SECURITY DEFINER) revalida todo y llama `validar_inscripcion(p_spc_id, p_carrera_id)`, que rechaza
   si `spcs.estado <> 'activo'`, edad fuera de rango (regla del 1° de julio), sexo fuera de condición, sanción vigente o
   cupo (§A.4).

### 1.2 Cuando el caballo no está

`renderListaCaballosModal()` (`portal.html:976-993`), con búsqueda activa y lista vacía:

```html
Ningún caballo del padrón coincide con esa búsqueda.<br>
Si el ejemplar existe y no aparece, todavía no está cargado en el sistema:
avisale a ${TEL}.
```

con `const TEL = 'la secretaría del hipódromo';` (`portal.html:360`).

**No es un error:** no hay toast, no hay request que falle, no hay botón. El usuario queda parado ahí. No existe ningún
camino de alta de ejemplar en el portal (el `grep` de `insert`/`from('spcs')` en `portal.html` sólo da el SELECT de "Mis
caballos", `portal.html:516`).

Si alguien intentara el INSERT a mano (consola), la política `spcs_insert` (`WITH CHECK fn_is_staff()`) lo frenaría con
`new row violates row-level security policy for table "spcs"` (42501). **No lo probé**: sería una escritura en prod. Se
deduce de la política (§A.2) y va en el probe (§9, P2).

---

## 2. Permisos de un usuario del portal sobre `spcs`

| Operación | Cómo | Resultado para el portal |
|---|---|---|
| Leer el padrón **completo** | `rpc_padron_spcs()` SECURITY DEFINER, guard `fn_is_staff() OR fn_is_portal_user()` | **Sí, los 238**: id, nombre, sexo, nacimiento, color, studbook_id, padre, madre, estado, habilitado |
| Buscar por nombre | `rpc_buscar_spc(p_q)` mismo guard, LIMIT 30 | Sí |
| `SELECT` directo a la tabla | política `spcs_select`: `fn_is_staff() OR id IN fn_mis_spc_visibles()` | Sólo lo suyo: caballos donde es entrenador (`spcs.entrenador_id`) o propietario activo (`spc_propietarios`), más los que él inscribió (`inscripciones.inscripto_por`) |
| `INSERT` | `spcs_insert` WITH CHECK `fn_is_staff()` | **No** |
| `UPDATE` | `spcs_update` USING/CHECK `fn_is_staff()` | **No** |
| `DELETE` | `spcs_delete` `fn_is_super_admin()` | **No** |

Notas:

- `fn_is_portal_user()` = usuario activo con rol `propietario` o `profesional` (§A.5). Hoy: 20 `profesional` + 5
  `propietario` activos (§A.7).
- **Visibilidad después de la alta:** la ficha nueva NO aparece en el SELECT directo del usuario hasta que la inscribe
  (`fn_mis_spc_visibles` la agrega por `inscripto_por`). No importa para el flujo (el modal usa `rpc_padron_spcs`), pero el
  caché `padronSpcs` del cliente hay que refrescarlo o agregarle la ficha a mano tras la alta.
- `spcs` tiene GRANT completo a `anon` y `authenticated` (§A.2b); lo que protege es RLS (activo). Es el patrón de toda la
  base; no se toca.
- **Lateral (fuera de alcance, lo anoto):** `rpc_inscribir`, `rpc_padron_spcs`, `validar_inscripcion`, `fn_mis_spc_ids`,
  `fn_mis_spc_visibles` son ejecutables por `anon` (§A.3). Todas tienen guard interno o devuelven vacío sin `auth.uid()`,
  así que no es un agujero hoy, pero es el mismo patrón que motivó `revoke_anon_anular_recibo.sql`. Candidato a REVOKE.

**Conclusión:** la política de `spcs` está bien cerrada y **no hay que tocarla**. La escritura nueva va por RPC.

---

## 3. Edge Function `studbook-buscar`: ¿quién puede llamarla?

**Sólo staff.** Tres capas (`supabase/functions/studbook-buscar/index.ts`):

1. Deploy con `verify_jwt: true` (§A.9): sin JWT válido, el gateway corta antes de la función.
2. `asCaller.auth.getUser(jwt)` → 401 `token_invalido` si no valida.
3. `asCaller.rpc('fn_is_staff')` con el JWT del caller → si no es `true`: **403 `solo_staff`, "Esta consulta es para la
   secretaría."**

Un usuario del portal tiene JWT válido (pasa 1 y 2) y cae en 3 → 403. `spcs.html` traduce ese código a "Esta consulta es
sólo para la secretaría." (`spcs.html:569-578`). Lo cubre `tests/probe_studbook_buscar_e2e.mjs` (200 staff / 403 portal /
401 sin token).

Versión desplegada: `studbook-buscar` v1, `verify_jwt: true`, `ezbr_sha256 eb5ca612…`. El contenido que devuelve
`get_edge_function` es igual al `index.ts` de `main` (comparado leyendo ambos completos; **no** por hash — el MCP no da
md5 del fuente).

Contrato: `POST { term }` (3–60 caracteres, sin controles) → `{ ok, term, exactos[], parciales[], fuente }`; cada
candidato: `sb_id, nombre, fecha_nacimiento (ISO), sexo (macho|hembra|castrado|null), sexo_sb, color, padrillo_nombre,
madre_nombre, abuelo_materno, pais_origen, url_perfil, leyenda, tomo, folio, raza, alertas[]`. Errores 400/401/403/405,
**502 `studbook_no_disponible`**, 500.

Fuente: **scraping** del autocompletar público `https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=`
con header `X-Requested-With: XMLHttpRequest`. No es API acordada. Medición de hoy en §A.10: 200 JSON en 0,89 s; sin el
header, 404 HTML.

---

## 4. Alta del ejemplar: obligatorios, qué llena el Stud Book, qué falta

Columnas de `spcs` (§A.1) cruzadas con lo que hace hoy `spcs.html` → `usarCandidato()` (`spcs.html:624-642`) +
`saveRecord()` (`spcs.html:691-733`):

| Columna | NOT NULL | Default | Del Stud Book | Qué haría la alta del portal |
|---|---|---|---|---|
| `id` | sí | `uuid_generate_v4()` | — | default |
| `nombre` | **sí** | — | `text` | del Stud Book, tal cual (mayúsculas) |
| `fecha_nacimiento` | **sí** | — | `nacimiento` dd/mm/yyyy → ISO | del Stud Book; **si viene NULL, rechazar** |
| `sexo` (`sexo_spc`: macho/hembra/castrado) | **sí** | — | `sexo` Macho/Hembra/Castrado | del Stud Book; **si no mapea, rechazar** |
| `estado` (`estado_spc`) | sí | `activo` | — | `activo` (tiene que serlo para inscribir, §5) |
| `studbook_id` | no (único parcial) | — | `id` | del Stud Book — **obligatorio en este camino** |
| `color` | no | — | `pelo` | del Stud Book |
| `padrillo_nombre` / `madre_nombre` | no | — | `padre` / `madre` | del Stud Book |
| `pais_origen` | no | `'Argentina'` | bandera `/10.png` → Argentina, si no NULL | igual que `spcs.html` |
| `notas` | no | — | arma `SB <id> · <url_perfil> · alta desde … · abuelo materno: … · <leyenda> · alertas` | mismo formato, con "alta desde el portal por <usuario> dd/mm/aaaa" |
| `abuela_materna` | no | — | **no lo trae** (trae abuelo materno) | NULL; el abuelo va en notas (criterio de las tandas R9) |
| `registro_stud_book` | no | — | — | NULL (criterio R9: 16 de 238 lo tienen) |
| `club_id` | no | — | — | **NULL**, como los 238 (padrón global, GOTCHA #13) |
| `caballeriza_id` / `entrenador_id` / `jockey_habitual_id` | no | — | — | **NULL**. La caballeriza y el entrenador ya se declaran en la inscripción. ⚠ Ver nota |
| `marcas`, `doc_url`, `foto_url`, `ult_performances` | no | — | — | NULL |
| `certificado_correr` | no | `false` | **no lo trae** (informe 29/09 §2) | `false`, como los 238 |
| `created_at` / `updated_at` | sí | `now()` | — | default |

**No hay que inventar ningún dato.** Lo que no viene queda NULL o en su default, igual que las altas que hace hoy Yesi.

⚠ **`entrenador_id` y "Mis caballos":** la tenencia del portal sale de `spcs.entrenador_id` (`fn_mis_spc_ids`). Si la alta
lo deja NULL, el caballo **no** aparece en "Mis caballos" del entrenador (sí en "Mis inscripciones"). Tentación: setearlo
con el `p_entrenador_id` de la inscripción. **No lo propongo**: sería que el portal escriba la tenencia de un caballo, que
hoy es decisión de la secretaría (y el que anota puede no ser el entrenador). Queda NULL; Yesi lo completa al revisar si
corresponde. **Decisión de producto → elegí la conservadora.**

---

## 5. Marca "pendiente de revisión"

### 5.1 ¿Existe algo hoy? No.

- `estado_spc` = `activo | retirado | suspendido | fallecido | vendido` (§A.1b). **No sirve:** `validar_inscripcion`
  rechaza todo `estado <> 'activo'` ("Tu ejemplar no está habilitado…"), y la decisión es que inscriba en el momento.
  Agregar un valor `pendiente` al ENUM obligaría a tocar `validar_inscripcion`, `rpc_padron_spcs.habilitado`, el filtro de
  `spcs.html`, el contador de `index.html` (`.eq('estado','activo')`)… y los ENUM no se pueden achicar (GOTCHA #11).
- `notas` (texto libre; 160/238 lo usan) no es filtrable de forma confiable.
- **`spcs` no tiene auditoría** (sólo `trg_spcs_updated_at`; §A.7 lista las 13 tablas auditadas y `spcs` no está) ni
  "creado por". Hoy no se puede saber quién dio de alta un ejemplar.

### 5.2 Propuesta (Fase 2, migración — no aplicada)

```sql
ALTER TABLE spcs
  ADD COLUMN alta_origen        text        NOT NULL DEFAULT 'secretaria'
                                 CHECK (alta_origen IN ('secretaria','portal')),
  ADD COLUMN alta_por           uuid        REFERENCES usuarios(id),
  ADD COLUMN revision_pendiente boolean     NOT NULL DEFAULT false,
  ADD COLUMN revisado_por       uuid        REFERENCES usuarios(id),
  ADD COLUMN revisado_at        timestamptz;
CREATE INDEX spcs_revision_pendiente_idx ON spcs (created_at) WHERE revision_pendiente;
```

- El DEFAULT deja a los 238 existentes como `secretaria` / no pendientes: nada cambia para ellos.
- Sólo la RPC del §6 pone `alta_origen='portal'`, `alta_por`, `revision_pendiente=true`.
- `spcs.html` (staff) marca revisado con un UPDATE normal (`revision_pendiente=false, revisado_por, revisado_at`): la
  política `spcs_update` ya es sólo staff, no hay que tocarla. Un trigger `BEFORE UPDATE` chico impone `revisado_por` /
  `revisado_at` desde `auth.uid()` (mismo patrón que ISSUE-097 con `modificado_por`) para que no los escriba el cliente.
- **Auditoría:** agregar `spcs` al trigger de auditoría existente (el mismo de las 13 tablas). Con eso queda registro de la
  alta del portal y de la revisión, y de toda edición de la secretaría — que hoy no existe (informe 29/09 §4). Es parte del
  mismo cambio porque sin eso "lo revisó" no es verificable.
- `rpc_padron_spcs` **no cambia**: el ejemplar pendiente es `activo` y aparece en el buscador como cualquier otro.

### 5.3 Dónde lo ve la secretaría (sin pantalla nueva)

1. **`spcs.html`** (es el padrón; es donde Yesi carga hoy los caballos a mano):
   - chip **"Por revisar: N"** en la fila de contadores (`spcs.html:155-160`), visible sólo si N > 0, clic = filtra;
   - opción **"Pendientes de revisión"** en el filtro (`#f-estado`, `spcs.html:166`) o un filtro aparte;
   - badge **"🆕 Portal — por revisar"** en la celda Nombre de la fila;
   - en el modal de edición: "Dado de alta desde el portal por *X* el *dd/mm*" + botón **"Marcar revisado"**.
2. **`inscripciones.html`**: la columna **"Cargada por"** (`inscripciones.html:674-676`) ya muestra "Portal + nombre"; se
   agrega una línea **"ficha nueva, por revisar"** cuando `spcs.revision_pendiente`. Es donde Yesi mira cada turno antes
   de ratificar, así que lo ve sin ir a buscarlo.

No agrego marca en `ratificacion.html` ni en `index.html`: con las dos de arriba alcanza, y en ratificación el caballo ya
pasó por inscripciones. Si Yesi lo pide, es el mismo badge.

### 5.4 ¿Y si nadie los revisa nunca?

- **No se rompe nada:** el caballo es `activo`, corre, cobra y liquida igual que cualquiera. La marca es informativa,
  por decisión (el cuello de botella es justamente esperar una aprobación).
- **Lo que queda en riesgo** es lo que la revisión agarra:
  1. **Homónimo mal elegido** (el Stud Book devuelve varios con el mismo nombre — ej. BIEN COQUETA: 2021 y 1998). Edad o
     sexo equivocados → puede quedar inscripto en una condición que no le corresponde. Atenuante: las reglas duras de la
     RPC (§6, D-edad) y `validar_inscripcion` con los datos del Stud Book; y la ratificación.
  2. **Ficha sin `entrenador_id` / caballeriza / propietario**: no aparece en "Mis caballos" y, para liquidación, sin
     propietario derivado (GOTCHA #47) — el mismo pozo que hoy tienen las altas de la secretaría sin completar.
- **Propuesta mínima para que no quede eterno:** el chip de `spcs.html` cuenta todos los pendientes sin vencimiento (no
  se esconden solos). Nada de recordatorios ni bloqueos automáticos en v1. Pregunta abierta para Yesi: ¿quiere que al
  **ratificar** un caballo pendiente aparezca un aviso (no bloqueo)? Ver §11.

---

## 6. Plan de la RPC (sin implementar)

### 6.1 El problema de confianza: ¿de dónde salen los datos?

La RPC va a crear una fila de `spcs` con datos que, en `spcs.html`, revisa una persona de la secretaría antes de guardar.
En el portal **nadie los revisa antes**. Si la RPC recibe los datos del navegador, un usuario del portal (o un script con
su JWT) puede mandar cualquier cosa: una fecha de nacimiento que lo meta en otra condición, un `sb_id` real con datos
falsos — y como `studbook_id` es único, **le "ocupa" el número al caballo verdadero** y la secretaría después no lo puede
dar de alta.

Tres opciones:

| | Quién arma los datos | Quién llama la RPC | Forjable desde el navegador |
|---|---|---|---|
| **A (recomendada)** | La Edge Function, que **vuelve a pedirle al Stud Book** el `sb_id` elegido | La Edge Function con `service_role`; la RPC tiene EXECUTE **sólo** para `service_role` | **No** |
| B | El navegador (lo que devolvió la búsqueda) | El usuario, con su JWT | **Sí** — la RPC sólo puede validar forma y duplicados |
| C | La Edge Function, y firma el payload con HMAC (secreto en `supabase_vault`, instalado) | El usuario, con su JWT; la RPC verifica la firma con `pgcrypto` | No, pero es más maquinaria |

**Recomiendo A.** Es la misma forma que ya tiene el proyecto para las 6 RPC sensibles (guard 0 por `service_role`) y no
abre ninguna política. La identidad del usuario la valida la Edge Function contra Auth (`getUser(jwt)`, como hoy) y la
pasa como parámetro: dentro de la RPC `auth.uid()` es NULL cuando llama `service_role`, así que el usuario viaja explícito
(`p_auth_user_id`) y la RPC lo **re-verifica** contra `usuarios`.

La base no puede hacer el HTTP por sí misma (extensiones instaladas: `plpgsql, pg_stat_statements, uuid-ossp, pgcrypto,
supabase_vault` — no hay `http` ni `pg_net`, §A.8), así que la re-consulta al Stud Book tiene que estar en la Edge
Function de todos modos.

### 6.2 Piezas

**Edge Function** — dos cambios en `studbook-buscar` (o una función hermana `studbook-traer`; prefiero la misma, para que
la fuente siga en un solo lugar entre los marcadores «FUENTE»):

1. **Buscar** (`{ term }`): el gate pasa de `fn_is_staff()` a `fn_is_staff() OR fn_is_portal_user()`. Nada más cambia.
2. **Traer** (`{ accion: 'traer', sb_id, nombre, carrera_id }`), nuevo:
   - JWT → `getUser` → `auth_user_id`; `fn_is_portal_user() OR fn_is_staff()` con el JWT del caller; si no → 403.
   - `autocomplete(nombre)` contra el Stud Book (la misma función de hoy) y se queda **sólo** con el hit cuyo `id ===
     sb_id`. Si no está → 409 `no_coincide` ("El Stud Book ya no devuelve ese caballo con ese nombre. Buscalo de nuevo.").
   - `aCandidato(hit)` → payload.
   - Llama la RPC con un cliente `service_role` (`SUPABASE_SERVICE_ROLE_KEY` es env estándar de las Edge Functions; no va al
     repo), pasando `p_auth_user_id` + payload + `p_carrera_id`.
   - Devuelve `{ ok, spc_id, ya_existia, ficha }`.

**RPC** `rpc_spc_alta_studbook_portal(p_auth_user_id uuid, p_carrera_id uuid, p_sb_id text, p_nombre text,
p_fecha_nacimiento date, p_sexo text, p_color text, p_padre text, p_madre text, p_abuelo_materno text, p_pais text,
p_url_perfil text, p_leyenda text, p_raza int, p_alertas text[]) RETURNS TABLE(spc_id uuid, ya_existia boolean)`

- `SECURITY DEFINER`, `SET search_path = public`.
- `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role;`
- md5 de `pg_get_functiondef` medido en el sandbox y escrito en el encabezado (GOTCHA #99).

**Cliente** `portal.html`: cuando la búsqueda local da 0 → debajo del texto actual, botón **"Buscar «X» en el Stud
Book"**. Lista de candidatos (mismo `candidatoHTML` que `spcs.html`: nombre, fecha, edad, sexo, pelaje, padre × madre,
SB). Botón **"Es este — anotarlo"** → `traer` → con el `spc_id` devuelto llama **el mismo `anotar(spcId)` de hoy**
(`rpc_inscribir`, sin cambios). Dos llamadas, una sola acción del usuario.

¿Por qué no hacer alta + inscripción en la misma transacción? Porque `rpc_inscribir` ya tiene todas las reglas de
inscripción y su probe; duplicarlas en otra RPC es dos lugares para lo mismo. Costo: si la inscripción falla después de la
alta (ej. el caballo no entra en la condición), la ficha queda creada y pendiente. Es aceptable: es un caballo real del
Stud Book, la secretaría la ve en "Por revisar", y el próximo intento la encuentra en el padrón.

### 6.3 Qué valida, qué rechaza y con qué mensaje

Los mensajes son para una persona (el portal los muestra sacando el prefijo, como hoy en `anotar()`).
Orden = orden de ejecución: los guards de identidad van **antes** de cualquier lectura de datos (lección de
`rpc_cambiar_monta`, ISSUE-084: el 42501 tiene que venir del guard, no de "no existe").

| # | Regla | Si falla | Código | Mensaje |
|---|---|---|---|---|
| G0 | El rol que llama es `service_role` (`auth.role()`) | rechaza | 42501 | `No autorizado.` (nunca llega al usuario: lo ve la Edge Function) |
| G1 | `p_auth_user_id` tiene usuario **activo** con rol `profesional`/`propietario` (o staff) | rechaza | 42501 | `No autorizado: la cuenta no tiene usuario activo del portal.` |
| G2 | El usuario tiene entidad de portal (`fn_mis_entidades` equivalente para ese uid: profesional o propietario) — misma condición que `rpc_inscribir` | rechaza | 42501 | `No autorizado: esta operación es para usuarios del portal.` |
| V1 | `p_carrera_id` existe, reunión `publicada`, carrera no anulada, `now()` entre `apertura_inscripcion` y `cierre_inscripcion` — **mismo texto de condición que `rpc_inscribir`** | rechaza | P0001 | `La inscripción para ese turno no está abierta.` (sólo se puede traer un caballo para anotarlo en un turno abierto; fuera de ventana, nada) |
| V2 | `p_sb_id` sólo dígitos, 1–9 | rechaza | 22023 | `El número de Stud Book no es válido.` |
| V3 | `p_raza = 4` (SPC) | rechaza | 22023 | `Ese ejemplar no figura como Sangre Pura de Carrera en el Stud Book. Consultá en secretaría.` |
| V4 | `p_nombre` no vacío, ≤ 60 | rechaza | 22023 | `El Stud Book no devolvió el nombre del caballo. Consultá en secretaría.` |
| V5 | `p_fecha_nacimiento` no NULL | rechaza | 22023 | `El Stud Book no tiene la fecha de nacimiento de ese caballo. Pedile a la secretaría que lo cargue.` |
| V6 | `p_sexo` ∈ macho/hembra/castrado | rechaza | 22023 | `El Stud Book no informa el sexo de ese caballo. Pedile a la secretaría que lo cargue.` |
| V7 (**D-edad**) | edad reglamentaria (`fn_edad_reglamentaria(reunión.fecha, nacimiento)`) entre 2 y 12 | rechaza | P0001 | `Ese caballo tiene N años según el Stud Book: revisá que hayas elegido el correcto (puede haber otro con el mismo nombre).` — atrapa el homónimo viejo (BIEN COQUETA 1998). **El 12 es una propuesta: decisión de Yesi/Fede (§11).** |
| D1 | Existe `spcs.studbook_id = p_sb_id` | **no crea; reusa** | — | devuelve `(id existente, ya_existia=true)`. No es error: es el caballo. El portal sigue a `anotar()`. |
| D2 | Una sola fila con misma `fecha_nacimiento` + mismo padre y madre (normalizados como `rpc_spcs_duplicados`) | **no crea; reusa** | — | igual que D1. **No** le escribe el `studbook_id` a esa ficha (sería el portal editando una ficha existente); queda para la secretaría. |
| D3 | **Más de una** fila con misma fecha + padre + madre (hoy: `Wave Rimout`) | rechaza | P0001 | `Ese caballo ya está cargado más de una vez en el padrón. Buscalo por nombre en la lista o avisale a la secretaría.` |
| D4 | Misma **nombre normalizado** pero otra fecha / otros padres (homónimo) | **crea igual** | — | crea con `revision_pendiente` y agrega a `notas`: `homónimo de <id existente>`. Rechazarlo bloquearía al caballo real; el revisor lo ve. |
| D5 | Fila existente con mismo nombre y **sin** padre/madre ni fecha comparables | crea igual | — | idem D4. (Hoy: 0 casos a medir en Fase 2; cobertura padre×madre ~99 %.) |
| R1 | Cupo: el usuario ya dio de alta ≥ **3** ejemplares desde el portal en las últimas 24 h (`alta_por`, `alta_origen='portal'`) | rechaza | P0001 | `Ya trajiste 3 caballos nuevos hoy. Si necesitás más, pedíselos a la secretaría.` — frena un script que llene el padrón. **3 es propuesta.** |
| W | INSERT con `alta_origen='portal'`, `alta_por`, `revision_pendiente=true`, `estado='activo'`, `club_id=NULL`, `notas` armado | — | — | devuelve `(id nuevo, false)` |
| W' | INSERT choca con `spcs_studbook_id_uniq` (carrera con otro usuario) | **no crea; reusa** | — | `ON CONFLICT DO NOTHING` + re-SELECT → `(id del otro, true)`. Ver §7. |

Lo que la RPC **no** hace, a propósito:

- No inscribe (lo hace `rpc_inscribir`, sin cambios).
- No toca `entrenador_id`, `caballeriza_id`, `spc_propietarios` ni ninguna ficha existente.
- No valida la condición del turno (edad mínima/máxima, sexo): eso es `validar_inscripcion`, que corre en `rpc_inscribir`.
  D-edad es sólo un control de plausibilidad para el homónimo.
- No acepta datos que no vengan del Stud Book: no hay alta manual desde el portal.

### 6.4 Lo que NO se afloja

- `spcs_insert` / `spcs_update` / `spcs_delete`: sin cambios.
- `inscripciones_insert`: sin cambios (el portal sigue sin INSERT directo; usa `rpc_inscribir`).
- ISSUE-093 (14 tablas de escritura sólo staff): sin cambios.
- La única superficie nueva para el portal es la acción `traer` de la Edge Function, que sólo escribe por la RPC.

---

## 7. Concurrencia: dos usuarios traen el mismo caballo a la vez

**Gana el primero y el segundo reusa la ficha. No quedan dos.**

Ya existe en prod (§A.1c):

```
spcs_studbook_id_uniq: CREATE UNIQUE INDEX spcs_studbook_id_uniq ON public.spcs USING btree (studbook_id) WHERE (studbook_id IS NOT NULL)
```

Como en el camino del portal **`studbook_id` es obligatorio** (V2), el índice garantiza unicidad a nivel base sin importar
el timing. En la RPC:

```sql
INSERT INTO spcs (...) VALUES (...)
ON CONFLICT (studbook_id) WHERE studbook_id IS NOT NULL DO NOTHING
RETURNING id INTO v_id;
IF v_id IS NULL THEN                       -- otro llegó primero
  SELECT id INTO v_id FROM spcs WHERE studbook_id = p_sb_id;
  RETURN QUERY SELECT v_id, true;          -- ya_existia
  RETURN;
END IF;
```

Con dos transacciones simultáneas, la segunda espera en el índice hasta que la primera hace commit y entonces su `DO
NOTHING` aplica; el re-SELECT ve la fila (READ COMMITTED). Ninguno de los dos ve un error. Los dos siguen a
`rpc_inscribir` con el mismo `spc_id`; si los dos lo anotan en el **mismo** turno, el segundo recibe el `Ese caballo ya
está anotado en ese turno.` de hoy.

Huecos que quedan (a conocer, no a cerrar en v1):

1. **Ficha vieja sin `studbook_id`** (113 de 238 no lo tienen, §A.6b): el índice no la ve. D2/D3 la buscan por fecha +
   padres, pero dos portales simultáneos sobre un caballo que tiene ficha vieja sin `studbook_id`… los dos encuentran la
   ficha vieja por D2 y la reusan. No crean. OK.
2. **Secretaría carga a mano sin buscar en el Stud Book** (sin `studbook_id`) al mismo tiempo que un portal lo trae: puede
   quedar un duplicado. Para cerrarlo haría falta un lock por nombre normalizado también en `spcs.html`; no lo propongo
   para v1 — la ventana es de segundos y el chip "Por revisar" lo deja a la vista.
3. Para D2/D3 contra filas sin `studbook_id` entre dos portales: `pg_advisory_xact_lock(hashtext(nombre_normalizado))` al
   empezar la RPC serializa las altas del mismo nombre. Barato; lo incluyo.

---

## 8. Qué ve la secretaría

Ver §5.3 (dónde) y §5.4 (si nadie revisa). Resumen: **marca en dos pantallas que ya existen** (`spcs.html`: chip +
filtro + badge + "Marcar revisado"; `inscripciones.html`: línea en "Cargada por"). Sin pantalla nueva, sin cola, sin
bloqueo. Si nadie revisa, el caballo corre igual; queda el chip contando.

---

## 9. Plan de probe (Fase 2)

Regla: **nada de crear ejemplares en prod** (GOTCHA #101 / regla del pedido). Todo lo que inserte en `spcs` corre en el
**sandbox `tests/local/`** (Postgres 16 + PostgREST, `PSQL_CMD`), con la migración aplicada ahí primero y el md5 medido.

### 9.1 `tests/probe_portal_alta_spc_studbook.mjs` — sandbox (base + cliente real)

Fixtures en el sandbox: copia de la 9999 (`clonar_9999.mjs`), un usuario de portal sintético `probe.altaspc@…` (rol
`profesional`, con entidad), un staff, un usuario de portal **inactivo**, la carrera T1 de la 9999 con ventana abierta y la
T2 con ventana cerrada; dos filas `Wave Rimout` como en prod.

| # | Caso | Assert |
|---|---|---|
| S1 | Portal trae caballo nuevo (payload sintético con `sb_id` que no existe) e **inscribe de corrido**: RPC → `rpc_inscribir` con la sesión real del usuario | 1 fila nueva en `spcs` con `alta_origen='portal'`, `alta_por`=usuario, `revision_pendiente=true`, `estado='activo'`, `club_id` NULL; 1 inscripción `canal='portal'`, `inscripto_por`=usuario; fila de auditoría de la alta |
| S2 | Mismo `sb_id` otra vez | `ya_existia=true`, mismo id, 0 filas nuevas |
| S3 | Dos llamadas **concurrentes** con el mismo `sb_id` (dos conexiones `psql`, `pg_sleep` dentro de la primera transacción) | 1 sola fila; las dos devuelven el mismo id |
| S4 | D2: fecha + padres de una ficha sin `studbook_id` | reusa, no crea, **no** le escribe `studbook_id` |
| S5 | D3: datos de `Wave Rimout` | rechazo con el mensaje D3 |
| S6 | D4: homónimo (mismo nombre, otra fecha) | crea, `notas` con "homónimo de <id>" |
| S7–S12 | V1 (T2 cerrada), V2, V3 (raza 3), V5, V6, V7 (1998) | rechazo con **ese** mensaje |
| S13 | R1: 4ª alta en 24 h | rechazo R1 |
| P1 | La RPC llamada con la sesión del **usuario de portal** (no `service_role`) | 42501 de G0 |
| P2 | Portal: `INSERT` / `UPDATE` / `DELETE` directo a `spcs` | rechazado por RLS (las políticas no cambiaron) |
| P3 | Portal: escritura en **otras tablas** — reusar la matriz de `probe_politicas_escritura_staff.mjs` (14 tablas × I/U/D) con este usuario | todas rechazadas (que la feature no abrió nada) |
| P4 | `anon` y `authenticated` sin EXECUTE sobre la RPC (`has_function_privilege`) | false / false |
| P5 | Usuario inactivo / sin entidad / staff de otro club | G1 / G2 |
| P6 | Staff marca revisado por UPDATE con `revisado_por` falso en el payload | el trigger impone `auth.uid()` |
| U1 | `portal.html`: búsqueda local vacía muestra el botón "Buscar en el Stud Book"; el flujo traer → `anotar(spcId)` llama `rpc_inscribir` con el id devuelto (harness de código real con `sb` stub, patrón `probe_gate4_portal_ui.mjs`) | |
| U2 | `spcs.html` / `inscripciones.html`: chip, filtro y badge aparecen con un pendiente y no con 0 | |

**Mutantes (uno por regla, `--mutantes`, en el sandbox):** sacar G0; sacar G1; sacar V1; sacar V3; sacar V5/V6; sacar V7;
cambiar D1 a "crea"; quitar `ON CONFLICT` (S3 tiene que dar error o 2 filas → rojo); D3 a "reusa la primera"; sacar R1;
`revision_pendiente` en false; GRANT a `authenticated`; quitar el trigger de `revisado_por`. Cada uno tiene que poner en
rojo al menos un caso; si alguno no, se declara equivalente con la razón (como M7 de `probe_guard_staff_rpcs`).

Restore: el sandbox se tira; igual el probe limpia por **estado** (ids de la corrida), auditoría antes que usuarios (FK).

### 9.2 Edge Function

- `tests/probe_studbook_buscar_fn.mjs` (existe): extender con la acción `traer` — lógica extraída del `index.ts`, contra el
  Stud Book real, sin Supabase: `sb_id` que coincide, que no coincide (409), Stud Book con `fetch` stub caído (502).
- `tests/probe_studbook_buscar_e2e.mjs` (existe): **buscar** pasa a 200 para portal (hoy assertea 403 — ese assert cambia a
  propósito y el cambio va en el commit); **traer** con portal sólo en casos que **no escriben**: `sb_id` de un caballo
  que ya está en el padrón (→ `ya_existia=true`, D1, 0 filas), carrera cerrada (V1), sin token (401), staff/portal de otro
  club. **Ningún caso positivo de alta en prod.** Usuarios sintéticos creados y borrados como hoy.

### 9.3 En prod después de aplicar

Sólo lectura + rechazos: md5 de la función = sandbox; `has_function_privilege`; `count(*) FROM spcs` igual antes y
después de correr el e2e; columnas nuevas con 238 filas en `secretaria`/`false`.

---

## 10. Riesgos

| Qué pasa | Qué se rompe | Qué ve el usuario del portal |
|---|---|---|
| Stud Book caído / timeout / 5xx | Buscar y traer devuelven 502 `studbook_no_disponible` (el código ya lo maneja) | "El Stud Book no responde ahora. Pedile a la secretaría que lo cargue." — **igual que hoy, nunca peor**. Lo ya cargado en el padrón se sigue anotando normal (no depende del Stud Book). |
| Cambia el formato (deja de ser JSON, piden otro header, cierran el endpoint) | `autocomplete()` lanza (chequea status, content-type JSON y que sea array) → 502 | Mismo mensaje. Hoy sin el header da 404 HTML (§A.10) y cae en ese camino. |
| Cambian los **nombres de campos** del JSON (sigue siendo JSON) | Peligroso: `aCandidato` llenaría NULLs. Con las reglas V3–V6 (raza, nombre, fecha, sexo obligatorios) **la RPC rechaza** en vez de crear fichas vacías. | "El Stud Book no tiene la fecha…/el sexo…; pedile a la secretaría". Agregar al probe un caso con hit mutilado. |
| Cambian el **significado** (ej. `id` deja de ser estable) | D1 deja de reconocer al caballo → podría crear duplicados con otro `studbook_id` | Nada visible; lo agarra la revisión (D2 por fecha + padres sigue reusando). Riesgo bajo. |
| El Stud Book bloquea por volumen (rate limit / IP de Supabase) | 502 | Mismo mensaje. Mitigación: el portal llama **sólo** con botón explícito tras búsqueda local vacía, nunca por tecla; cupo R1. Volumen esperado: decenas por reunión. |
| Llega la API de Diego (ISSUE-030) | Se reemplaza sólo lo de «FUENTE» en la Edge Function; RPC y portal no cambian | Nada |
| Homónimo mal elegido | Edad/sexo equivocados en la ficha | V7 frena los muy viejos; el resto lo frena `validar_inscripcion` o lo agarra la revisión |
| Abuso (llenar el padrón) | Fichas basura **reales** (salen del Stud Book; no se pueden inventar) | R1 lo corta en 3/día por usuario; todo queda con `alta_por` y auditado |
| Inscripción falla después de la alta | Ficha pendiente sin inscripción | El mensaje de `rpc_inscribir` de hoy; el caballo ya aparece en el buscador para el próximo intento |

---

## 11. Preguntas abiertas (para vos / Yesi / Fede)

1. **Opción A vs B (§6.1)**: confirmo A (la Edge Function re-consulta al Stud Book y es la única que llama la RPC). B es
   más simple pero deja que el navegador mande la ficha.
2. **D-edad (V7)**: ¿2 a 12 años de edad reglamentaria como límite de plausibilidad? ¿Otro número?
3. **R1**: ¿3 altas por usuario por día?
4. **`entrenador_id`**: ¿queda NULL (propuesto) o se setea con el entrenador declarado en la inscripción?
5. **Aviso al ratificar** un caballo pendiente de revisión: ¿lo quiere Yesi? (no está en el plan v1).
6. **Wave Rimout**: es un duplicado real (SB 397805, una sola entrada en el Stud Book). La fila `f277af1c` tiene 1
   inscripción (R6 T11, forfait) y la `5ebc5e48` 1 (R8 T10, ratificado). ¿Se unifica como `Fist Queen`/`Malenuchi`
   (PLAN_DUPLICADOS_SPC)? Mientras tanto D3 rechaza ese caso en el portal. Y el comentario de `spcs.html` (~línea 652:
   "homónimos legítimos existen: Wave Rimout") hay que corregirlo.
7. **Baseline de `CLAUDE.md`**: 210 → 238.
8. **Lateral**: REVOKE de `anon` en `rpc_inscribir`, `rpc_padron_spcs`, `validar_inscripcion`, `fn_mis_spc_ids`,
   `fn_mis_spc_visibles` (§2). Fuera de esta tarea.

---

## Anexo A — consultas y salidas crudas (tal como se corrieron, por MCP `execute_sql`, sólo lectura)

### A.1 Columnas de `spcs`

```sql
select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='spcs' order by ordinal_position;
```

```json
[{"column_name":"id","data_type":"uuid","is_nullable":"NO","column_default":"uuid_generate_v4()"},{"column_name":"club_id","data_type":"uuid","is_nullable":"YES","column_default":null},{"column_name":"nombre","data_type":"character varying","is_nullable":"NO","column_default":null},{"column_name":"registro_stud_book","data_type":"character varying","is_nullable":"YES","column_default":null},{"column_name":"fecha_nacimiento","data_type":"date","is_nullable":"NO","column_default":null},{"column_name":"sexo","data_type":"USER-DEFINED","is_nullable":"NO","column_default":null},{"column_name":"color","data_type":"character varying","is_nullable":"YES","column_default":null},{"column_name":"marcas","data_type":"text","is_nullable":"YES","column_default":null},{"column_name":"padrillo_nombre","data_type":"character varying","is_nullable":"YES","column_default":null},{"column_name":"madre_nombre","data_type":"character varying","is_nullable":"YES","column_default":null},{"column_name":"abuela_materna","data_type":"character varying","is_nullable":"YES","column_default":null},{"column_name":"pais_origen","data_type":"character varying","is_nullable":"YES","column_default":"'Argentina'::character varying"},{"column_name":"caballeriza_id","data_type":"uuid","is_nullable":"YES","column_default":null},{"column_name":"entrenador_id","data_type":"uuid","is_nullable":"YES","column_default":null},{"column_name":"jockey_habitual_id","data_type":"uuid","is_nullable":"YES","column_default":null},{"column_name":"estado","data_type":"USER-DEFINED","is_nullable":"NO","column_default":"'activo'::estado_spc"},{"column_name":"notas","data_type":"text","is_nullable":"YES","column_default":null},{"column_name":"doc_url","data_type":"text","is_nullable":"YES","column_default":null},{"column_name":"foto_url","data_type":"text","is_nullable":"YES","column_default":null},{"column_name":"created_at","data_type":"timestamp with time zone","is_nullable":"NO","column_default":"now()"},{"column_name":"updated_at","data_type":"timestamp with time zone","is_nullable":"NO","column_default":"now()"},{"column_name":"certificado_correr","data_type":"boolean","is_nullable":"YES","column_default":"false"},{"column_name":"ult_performances","data_type":"text","is_nullable":"YES","column_default":null},{"column_name":"studbook_id","data_type":"text","is_nullable":"YES","column_default":null}]
```

### A.1b/c Conteo, índices, constraints, triggers, ENUMs, RLS

```sql
select json_build_object(
 'count', (select count(*) from spcs),
 'indexes', (select json_agg(json_build_object('n',indexname,'d',indexdef)) from pg_indexes where schemaname='public' and tablename='spcs'),
 'constraints', (select json_agg(json_build_object('n',conname,'d',pg_get_constraintdef(oid))) from pg_constraint where conrelid='public.spcs'::regclass),
 'triggers', (select json_agg(json_build_object('n',tgname,'d',pg_get_triggerdef(oid))) from pg_trigger where tgrelid='public.spcs'::regclass and not tgisinternal),
 'enum_estado_spc', (select json_agg(enumlabel order by enumsortorder) from pg_enum where enumtypid='estado_spc'::regtype),
 'enum_sexo', (select json_agg(e.enumlabel order by enumsortorder) from pg_enum e join pg_attribute a on a.atttypid=e.enumtypid where a.attrelid='public.spcs'::regclass and a.attname='sexo'),
 'rls', (select relrowsecurity from pg_class where oid='public.spcs'::regclass)
) as r;
```

```json
[{"r":{"count":238,"indexes":[{"n":"spcs_pkey","d":"CREATE UNIQUE INDEX spcs_pkey ON public.spcs USING btree (id)"},{"n":"idx_spcs_club","d":"CREATE INDEX idx_spcs_club ON public.spcs USING btree (club_id)"},{"n":"spcs_studbook_id_uniq","d":"CREATE UNIQUE INDEX spcs_studbook_id_uniq ON public.spcs USING btree (studbook_id) WHERE (studbook_id IS NOT NULL)"}],"constraints":[{"n":"spcs_caballeriza_id_fkey","d":"FOREIGN KEY (caballeriza_id) REFERENCES caballerizas(id)"},{"n":"spcs_club_id_fkey","d":"FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE"},{"n":"spcs_entrenador_id_fkey","d":"FOREIGN KEY (entrenador_id) REFERENCES profesionales(id)"},{"n":"spcs_jockey_habitual_id_fkey","d":"FOREIGN KEY (jockey_habitual_id) REFERENCES profesionales(id)"},{"n":"spcs_pkey","d":"PRIMARY KEY (id)"}],"triggers":[{"n":"trg_spcs_updated_at","d":"CREATE TRIGGER trg_spcs_updated_at BEFORE UPDATE ON public.spcs FOR EACH ROW EXECUTE FUNCTION set_updated_at()"}],"enum_estado_spc":["activo","retirado","suspendido","fallecido","vendido"],"enum_sexo":["macho","hembra","castrado"],"rls":true}}]
```

### A.2 Políticas de `spcs`

```sql
select policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' and tablename='spcs' order by cmd, policyname;
```

```json
[{"policyname":"spcs_delete","cmd":"DELETE","roles":"{authenticated}","qual":"( SELECT fn_is_super_admin() AS fn_is_super_admin)","with_check":null},{"policyname":"spcs_insert","cmd":"INSERT","roles":"{authenticated}","qual":null,"with_check":"( SELECT fn_is_staff() AS fn_is_staff)"},{"policyname":"spcs_select","cmd":"SELECT","roles":"{authenticated}","qual":"(( SELECT fn_is_staff() AS fn_is_staff) OR (id IN ( SELECT s.spc_id\n   FROM fn_mis_spc_visibles() s(spc_id))))","with_check":null},{"policyname":"spcs_update","cmd":"UPDATE","roles":"{authenticated}","qual":"( SELECT fn_is_staff() AS fn_is_staff)","with_check":"( SELECT fn_is_staff() AS fn_is_staff)"}]
```

### A.2b GRANTs de tabla sobre `spcs`

(Corrido en el mismo lote que A.1b; el MCP devolvió sólo el último resultado del lote, que es éste.)

```sql
select grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema='public' and table_name='spcs' group by grantee;
```

```json
[{"grantee":"anon","string_agg":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"grantee":"authenticated","string_agg":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"grantee":"postgres","string_agg":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"},{"grantee":"service_role","string_agg":"DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE"}]
```

### A.3 Funciones relacionadas: SECURITY DEFINER, EXECUTE, md5

```sql
select p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) args,
 (select string_agg(r.rolname,',') from pg_roles r where has_function_privilege(r.oid,p.oid,'EXECUTE') and r.rolname in ('anon','authenticated','service_role')) exec_roles,
 md5(pg_get_functiondef(p.oid)) md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('rpc_padron_spcs','rpc_inscribir','validar_inscripcion','rpc_spcs_duplicados','fn_mis_spc_ids','fn_mis_spc_visibles','fn_is_staff','fn_is_portal','fn_audit','fn_es_portal') or (n.nspname='public' and p.proname ilike '%spc%') order by 1;
```

```json
[{"proname":"fn_is_staff","prosecdef":true,"args":"","exec_roles":"authenticated,anon,service_role","md5":"3accbc759c7e8181632acbe72a0b993c"},{"proname":"fn_mis_spc_ids","prosecdef":true,"args":"","exec_roles":"authenticated,anon,service_role","md5":"91fbadbe11a8c327438e650028bf3cd9"},{"proname":"fn_mis_spc_visibles","prosecdef":true,"args":"","exec_roles":"authenticated,anon,service_role","md5":"05be1b0e005f9d1d370ed27bff473568"},{"proname":"rpc_buscar_spc","prosecdef":true,"args":"p_q text","exec_roles":"authenticated,service_role","md5":"95b30588bd2886017837ac225ece27ba"},{"proname":"rpc_inscribir","prosecdef":true,"args":"p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid, p_jockey_suplente_id uuid","exec_roles":"authenticated,anon,service_role","md5":"0605392e3ad9ed0baee9a32340f47deb"},{"proname":"rpc_padron_spcs","prosecdef":true,"args":"","exec_roles":"authenticated,anon,service_role","md5":"c9c1473ab69c2d832bc477bc5ef2c987"},{"proname":"rpc_spcs_duplicados","prosecdef":true,"args":"p_studbook_id text, p_nombre text, p_fecha_nacimiento date, p_padrillo text, p_madre text","exec_roles":"authenticated,service_role","md5":"1d4a2ab956845fb567610f9b3487be9d"},{"proname":"validar_inscripcion","prosecdef":true,"args":"p_spc_id uuid, p_carrera_id uuid","exec_roles":"authenticated,anon,service_role","md5":"62e6e9da5abf6d3d21d00ec99d34c007"}]
```

Definiciones:

```sql
select p.proname, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rpc_padron_spcs','rpc_inscribir','fn_mis_spc_visibles','fn_mis_spc_ids','rpc_spcs_duplicados','fn_is_staff','rpc_buscar_spc') order by 1;
```

```sql
-- fn_is_staff
CREATE OR REPLACE FUNCTION public.fn_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_user_id = auth.uid()
      AND activo
      AND rol IN ('super_admin', 'secretario_carreras', 'operador')
  );
$function$

-- fn_mis_spc_ids
CREATE OR REPLACE FUNCTION public.fn_mis_spc_ids()
 RETURNS TABLE(spc_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id FROM spcs s
   WHERE s.entrenador_id IN (
     SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'profesional')
  UNION
  SELECT sp.spc_id FROM spc_propietarios sp
   WHERE sp.activo
     AND sp.propietario_id IN (
       SELECT e.entidad_id FROM fn_mis_entidades() e WHERE e.entidad_tipo = 'propietario');
$function$

-- fn_mis_spc_visibles
CREATE OR REPLACE FUNCTION public.fn_mis_spc_visibles()
 RETURNS TABLE(spc_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.spc_id FROM fn_mis_spc_ids() m
  UNION
  SELECT i.spc_id
    FROM inscripciones i
    JOIN usuarios u ON u.id = i.inscripto_por
   WHERE u.auth_user_id = auth.uid() AND u.activo;
$function$

-- rpc_buscar_spc
CREATE OR REPLACE FUNCTION public.rpc_buscar_spc(p_q text)
 RETURNS TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text, padrillo_nombre text, madre_nombre text, studbook_id text, estado text, habilitado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_q text;
BEGIN
  IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  IF p_q IS NULL OR length(btrim(p_q)) < 2 THEN
    RETURN;
  END IF;

  v_q := '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
    SELECT s.id, s.nombre::text, s.sexo::text, s.fecha_nacimiento,
           s.color::text, s.padrillo_nombre::text, s.madre_nombre::text,
           s.studbook_id::text, s.estado::text,
           (s.estado = 'activo') AS habilitado
      FROM spcs s
     WHERE s.nombre ILIKE v_q ESCAPE '\'
     ORDER BY (s.estado = 'activo') DESC, s.nombre
     LIMIT 30;
END;
$function$

-- rpc_inscribir
CREATE OR REPLACE FUNCTION public.rpc_inscribir(p_spc_id uuid, p_carrera_id uuid, p_caballeriza_id uuid, p_entrenador_id uuid, p_jockey_titular_id uuid DEFAULT NULL::uuid, p_jockey_suplente_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuario_id     uuid;
  v_carrera        RECORD;
  v_reunion_estado text;
  v_club_id        uuid;
  v_spc            RECORD;
  v_ok             boolean;
  v_motivo         text;
  v_id             uuid;
BEGIN
  -- Entidad de portal: profesional O propietario. Quién anota queda en
  -- inscripto_por; quién entrena se declara en p_entrenador_id.
  IF NOT EXISTS (
    SELECT 1 FROM fn_mis_entidades() e
     WHERE e.entidad_tipo IN ('profesional', 'propietario')
  ) THEN
    RAISE EXCEPTION 'No autorizado: esta operación es para usuarios del portal.';
  END IF;

  SELECT u.id INTO v_usuario_id
    FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: la cuenta no tiene usuario activo.';
  END IF;

  SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El caballo no existe.';
  END IF;

  SELECT c.*, r.estado::text AS reunion_estado, r.club_id AS club_id
    INTO v_carrera
    FROM carreras c JOIN reuniones r ON r.id = c.reunion_id
   WHERE c.id = p_carrera_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La carrera no existe.';
  END IF;

  v_reunion_estado := v_carrera.reunion_estado;
  v_club_id        := v_carrera.club_id;

  IF v_reunion_estado IS DISTINCT FROM 'publicada'
     OR v_carrera.estado IS NOT DISTINCT FROM 'anulada'
     OR v_carrera.apertura_inscripcion IS NULL
     OR v_carrera.cierre_inscripcion  IS NULL
     OR now() < v_carrera.apertura_inscripcion
     OR now() > v_carrera.cierre_inscripcion
  THEN
    RAISE EXCEPTION 'La inscripción para ese turno no está abierta.';
  END IF;

  IF p_caballeriza_id IS NULL THEN
    RAISE EXCEPTION 'Falta la caballeriza: es obligatoria para anotar.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM caballerizas
     WHERE id = p_caballeriza_id AND activo AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'Esa caballeriza no existe o no está activa en este hipódromo.';
  END IF;

  IF p_entrenador_id IS NULL THEN
    RAISE EXCEPTION 'Falta el entrenador: hay que declarar quién presenta el caballo.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM profesionales
     WHERE id = p_entrenador_id AND activo
       AND tipo IN ('entrenador', 'ambos') AND club_id = v_club_id
  ) THEN
    RAISE EXCEPTION 'El entrenador declarado no está en el padrón activo de este hipódromo.';
  END IF;

  -- Jockey OPCIONAL al anotar: se define hasta el martes y es obligatorio en
  -- la ratificación. Si viene, tiene que ser del padrón.
  IF p_jockey_titular_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM profesionales
        WHERE id = p_jockey_titular_id AND activo
          AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
     )
  THEN
    RAISE EXCEPTION 'El jockey declarado no está en el padrón activo de este hipódromo.';
  END IF;

  IF p_jockey_suplente_id IS NOT NULL THEN
    IF p_jockey_titular_id IS NULL THEN
      RAISE EXCEPTION 'No se puede declarar un suplente sin jockey titular.';
    END IF;
    IF p_jockey_suplente_id = p_jockey_titular_id THEN
      RAISE EXCEPTION 'El suplente no puede ser el mismo jockey que el titular.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM profesionales
       WHERE id = p_jockey_suplente_id AND activo
         AND tipo IN ('jockey', 'ambos') AND club_id = v_club_id
    ) THEN
      RAISE EXCEPTION 'El jockey suplente no está en el padrón activo de este hipódromo.';
    END IF;
  END IF;

  SELECT v.puede_inscribirse, v.motivo
    INTO v_ok, v_motivo
    FROM validar_inscripcion(p_spc_id, p_carrera_id) v;

  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'No se puede inscribir: %', COALESCE(v_motivo, 'no cumple las condiciones de la carrera');
  END IF;

  IF EXISTS (
    SELECT 1 FROM inscripciones
     WHERE carrera_id = p_carrera_id AND spc_id = p_spc_id
  ) THEN
    RAISE EXCEPTION 'Ese caballo ya está anotado en ese turno.';
  END IF;

  INSERT INTO inscripciones (
    carrera_id, spc_id, estado, canal, inscripto_por,
    entrenador_id, caballeriza_id, jockey_titular_id, jockey_suplente_id
  ) VALUES (
    p_carrera_id, p_spc_id,
    'inscripto',
    'portal',
    v_usuario_id,
    p_entrenador_id,
    p_caballeriza_id,
    p_jockey_titular_id,
    p_jockey_suplente_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$

-- rpc_padron_spcs
CREATE OR REPLACE FUNCTION public.rpc_padron_spcs()
 RETURNS TABLE(id uuid, nombre text, sexo text, fecha_nacimiento date, color text, studbook_id text, padrillo_nombre text, madre_nombre text, estado text, habilitado boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Misma autorización que rpc_buscar_spc: staff o usuario de portal.
  IF NOT ((SELECT fn_is_staff()) OR (SELECT fn_is_portal_user())) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN QUERY
    SELECT s.id, s.nombre::text, s.sexo::text, s.fecha_nacimiento,
           s.color::text, s.studbook_id::text,
           s.padrillo_nombre::text, s.madre_nombre::text,
           s.estado::text,
           (s.estado = 'activo') AS habilitado
      FROM spcs s
     ORDER BY s.nombre;
END;
$function$

-- rpc_spcs_duplicados
CREATE OR REPLACE FUNCTION public.rpc_spcs_duplicados(p_studbook_id text, p_nombre text, p_fecha_nacimiento date, p_padrillo text, p_madre text)
 RETURNS TABLE(motivo text, id uuid, nombre character varying, fecha_nacimiento date, sexo sexo_spc, color character varying, padrillo_nombre character varying, madre_nombre character varying, studbook_id text, estado estado_spc)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nn text;
BEGIN
  IF NOT fn_is_staff() THEN
    RAISE EXCEPTION 'rpc_spcs_duplicados: solo staff' USING ERRCODE = '42501';
  END IF;

  v_nn := upper(regexp_replace(translate(coalesce(p_nombre, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g'));

  RETURN QUERY
    SELECT 'studbook_id'::text, s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.color, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s
    WHERE p_studbook_id IS NOT NULL AND btrim(p_studbook_id) <> '' AND s.studbook_id = btrim(p_studbook_id)
  UNION ALL
    SELECT 'nombre'::text, s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.color, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s
    WHERE v_nn <> ''
      AND upper(regexp_replace(translate(s.nombre, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'), '[^A-Za-z0-9]', '', 'g')) = v_nn
  UNION ALL
    SELECT 'fecha_padre_madre'::text, s.id, s.nombre, s.fecha_nacimiento, s.sexo, s.color, s.padrillo_nombre, s.madre_nombre, s.studbook_id, s.estado
    FROM spcs s
    WHERE p_fecha_nacimiento IS NOT NULL
      AND s.fecha_nacimiento = p_fecha_nacimiento
      AND upper(btrim(coalesce(s.padrillo_nombre, ''))) = upper(btrim(coalesce(p_padrillo, '')))
      AND upper(btrim(coalesce(s.madre_nombre,    ''))) = upper(btrim(coalesce(p_madre,    '')))
      AND (coalesce(p_padrillo, '') <> '' OR coalesce(p_madre, '') <> '');
END;
$function$
```

### A.4 `validar_inscripcion`

```sql
select pg_get_functiondef('public.validar_inscripcion(uuid,uuid)'::regprocedure) def;
```

```sql
CREATE OR REPLACE FUNCTION public.validar_inscripcion(p_spc_id uuid, p_carrera_id uuid)
 RETURNS TABLE(puede_inscribirse boolean, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_spc RECORD; v_carrera RECORD; v_edad_carrera INTEGER; v_sancion RECORD;
    -- Texto provisorio hasta que Fede defina qué se le puede decir al portal.
    v_generico CONSTANT TEXT := 'Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.';
    -- ¿Quién pregunta tiene derecho al motivo detallado? Staff siempre. Un usuario
    -- de portal, nunca — ni sobre su propio ejemplar — hasta que Fede lo defina.
    v_detalle BOOLEAN := fn_is_staff();
BEGIN
    SELECT * INTO v_spc FROM spcs WHERE id = p_spc_id;
    IF v_spc IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró el ejemplar.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_carrera FROM carreras WHERE id = p_carrera_id;
    IF v_carrera IS NULL THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'No se encontró la carrera.' ELSE v_generico END; RETURN;
    END IF;

    -- Regla del 1° de julio, centralizada en fn_edad_reglamentaria.
    -- ANTES (roto): DATE_PART('year', AGE(reunion.fecha, v_spc.fecha_nacimiento))
    -- daba el aniversario real. La fecha de referencia (reuniones.fecha) ya estaba bien.
    SELECT fn_edad_reglamentaria(r.fecha, v_spc.fecha_nacimiento)
      INTO v_edad_carrera
      FROM reuniones r
     WHERE r.id = v_carrera.reunion_id;

    IF v_spc.estado != 'activo' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'El SPC no está activo: ' || v_spc.estado ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_minima_anos IS NOT NULL AND v_edad_carrera < v_carrera.edad_minima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Edad insuficiente: ' || v_edad_carrera || ' años. Mínimo: ' || v_carrera.edad_minima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.edad_maxima_anos IS NOT NULL AND v_edad_carrera > v_carrera.edad_maxima_anos THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Excede edad máxima: ' || v_edad_carrera || ' años. Máximo: ' || v_carrera.edad_maxima_anos
            ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos' AND v_spc.sexo NOT IN ('macho', 'castrado') THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para machos.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'hembras' AND v_spc.sexo != 'hembra' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para hembras.' ELSE v_generico END; RETURN;
    END IF;
    IF v_carrera.condicion_sexo = 'machos_castrados' AND v_spc.sexo != 'castrado' THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'Carrera solo para castrados.' ELSE v_generico END; RETURN;
    END IF;

    SELECT * INTO v_sancion FROM v_sanciones_vigentes
     WHERE entidad_tipo = 'spc' AND entidad_id = p_spc_id LIMIT 1;
    IF FOUND THEN
        RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
            THEN 'SPC con sanción vigente: ' || v_sancion.tipo_sancion ELSE v_generico END; RETURN;
    END IF;

    IF v_carrera.cupo_maximo IS NOT NULL THEN
        IF (SELECT COUNT(*) FROM inscripciones
             WHERE carrera_id = p_carrera_id AND estado != 'forfait') >= v_carrera.cupo_maximo THEN
            RETURN QUERY SELECT FALSE, 'Cupo máximo alcanzado.'; RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE, 'SPC habilitado para inscribirse.';
END;
$function$
```

### A.5 Wave Rimout, duplicados por nombre, cobertura, altas recientes, `fn_is_portal_user`, triggers de `spcs`

```sql
select json_build_object(
 'wave', (select json_agg(json_build_object('id',id,'nombre',nombre,'fn',fecha_nacimiento,'sb',studbook_id,'rsb',registro_stud_book,'padre',padrillo_nombre,'madre',madre_nombre,'estado',estado,'club',club_id,'created',created_at,'insc',(select count(*) from inscripciones i where i.spc_id=s.id))) from spcs s where nombre ilike '%wave%rimout%'),
 'dup_nombre_norm', (select json_agg(x) from (select upper(regexp_replace(translate(nombre,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'[^A-Za-z0-9]','','g')) nn, count(*) c from spcs group by 1 having count(*)>1) x),
 'cobertura', (select json_build_object('total',count(*),'con_studbook_id',count(studbook_id),'con_registro',count(registro_stud_book),'con_club',count(club_id),'con_entrenador',count(entrenador_id),'con_caballeriza',count(caballeriza_id),'con_notas',count(notas),'estado',(select json_object_agg(estado,c) from (select estado,count(*) c from spcs group by 1) e)) from spcs),
 'altas_desde_0914', (select json_agg(json_build_object('nombre',nombre,'created',created_at,'sb',studbook_id) order by created_at) from spcs where created_at >= '2026-09-14'),
 'fn_is_portal_user', (select pg_get_functiondef(p.oid) from pg_proc p where proname='fn_is_portal_user'),
 'audit_trg_spcs', (select json_agg(tgname) from pg_trigger where tgrelid='public.spcs'::regclass)
) r;
```

```json
[{"r":{"wave":[{"id":"5ebc5e48-2caf-4c44-be6a-ad75f2716850","nombre":"Wave Rimout","fn":"2017-08-08","sb":null,"rsb":null,"padre":"Remote (GB)","madre":"Holiday Wave","estado":"activo","club":null,"created":"2026-06-12T22:15:39.928079+00:00","insc":1},{"id":"f277af1c-a4ac-4a98-87d7-b41871718c8d","nombre":"Wave Rimout","fn":"2017-08-08","sb":null,"rsb":null,"padre":"Remote (GB)","madre":"Holiday Wave","estado":"activo","club":null,"created":"2026-05-07T03:40:26.42534+00:00","insc":1}],"dup_nombre_norm":[{"nn":"WAVERIMOUT","c":2}],"cobertura":{"total":238,"con_studbook_id":125,"con_registro":16,"con_club":0,"con_entrenador":147,"con_caballeriza":152,"con_notas":160,"estado":{"activo":238}},"altas_desde_0914":[{"nombre":"LEONADA CHAT","created":"2026-09-14T18:27:50.400892+00:00","sb":"436947"},{"nombre":"OJO EXCELENTE","created":"2026-09-14T18:28:56.371801+00:00","sb":"439788"},{"nombre":"GRAN RAUL","created":"2026-09-14T18:38:27.850761+00:00","sb":"433458"},{"nombre":"CANDIDATA PIRANERA","created":"2026-09-14T18:41:14.351104+00:00","sb":"438953"},{"nombre":"ARTHURUS","created":"2026-09-14T19:29:16.931593+00:00","sb":"425177"},{"nombre":"LA MENONA","created":"2026-09-30T01:49:24.195505+00:00","sb":"439464"},{"nombre":"ORADA LEGS","created":"2026-09-30T01:53:19.054941+00:00","sb":"438403"},{"nombre":"TALA VUELTA","created":"2026-09-30T01:56:41.444886+00:00","sb":"432786"},{"nombre":"EL GRAN TATO","created":"2026-09-30T02:05:32.950957+00:00","sb":"411836"},{"nombre":"EMM VAGABUNDO","created":"2026-09-30T02:17:39.336626+00:00","sb":"415071"},{"nombre":"LAPACHO TUCUMANO","created":"2026-09-30T16:59:45.702717+00:00","sb":"444601"},{"nombre":"OVERHANG","created":"2026-09-30T17:01:26.748188+00:00","sb":"435156"},{"nombre":"OKAMI","created":"2026-09-30T17:05:08.740593+00:00","sb":"437545"},{"nombre":"CHAPTER NINE","created":"2026-09-30T17:11:09.806061+00:00","sb":"429343"},{"nombre":"DIVISOR","created":"2026-09-30T17:13:09.350804+00:00","sb":"428375"},{"nombre":"MALALA RISK","created":"2026-10-01T15:41:33.496469+00:00","sb":"446843"},{"nombre":"MACHO MASK","created":"2026-10-01T15:41:47.65081+00:00","sb":"443042"},{"nombre":"SOY ESENCIAL","created":"2026-10-01T15:42:23.826015+00:00","sb":"442675"},{"nombre":"IMPERIO PERSA","created":"2026-10-01T15:42:37.669588+00:00","sb":"444568"},{"nombre":"DON FIFO","created":"2026-10-01T16:01:37.098515+00:00","sb":"433634"},{"nombre":"IVER MARO","created":"2026-10-01T16:01:51.858105+00:00","sb":"432434"},{"nombre":"TARSICO RUNNER","created":"2026-10-01T16:06:24.108718+00:00","sb":"440217"},{"nombre":"MUY LUJOSO","created":"2026-10-01T16:10:45.242678+00:00","sb":"455153"},{"nombre":"GANAS DE VENCER","created":"2026-10-01T16:12:38.806833+00:00","sb":"423806"},{"nombre":"FEEL COOL","created":"2026-10-01T16:16:20.791161+00:00","sb":"415952"},{"nombre":"PEAKY GIRL","created":"2026-10-01T16:19:42.194573+00:00","sb":"406709"},{"nombre":"AMIGO FIESTERO","created":"2026-10-01T16:23:04.187213+00:00","sb":"427286"},{"nombre":"THE BEST HIT","created":"2026-10-01T16:25:23.826477+00:00","sb":"413810"},{"nombre":"MI DULCE ESPERANZA","created":"2026-10-01T16:52:08.923488+00:00","sb":"430460"},{"nombre":"HOMEBIOGAS","created":"2026-10-01T17:01:04.713863+00:00","sb":"359973"},{"nombre":"MANUEL ROB","created":"2026-10-01T17:02:35.046701+00:00","sb":"419931"},{"nombre":"SOL MAJO","created":"2026-10-01T17:08:17.36383+00:00","sb":"438962"},{"nombre":"SOL PATRIOTA","created":"2026-10-01T17:08:37.83153+00:00","sb":"422321"}],"fn_is_portal_user":"CREATE OR REPLACE FUNCTION public.fn_is_portal_user()\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  SELECT EXISTS (\n    SELECT 1 FROM usuarios\n    WHERE auth_user_id = auth.uid()\n      AND activo\n      AND rol IN ('propietario', 'profesional')\n  );\n$function$\n","audit_trg_spcs":["RI_ConstraintTrigger_a_17770","RI_ConstraintTrigger_a_17771","RI_ConstraintTrigger_a_17786","RI_ConstraintTrigger_a_17787","RI_ConstraintTrigger_a_17971","RI_ConstraintTrigger_a_17972","RI_ConstraintTrigger_a_18017","RI_ConstraintTrigger_a_18018","RI_ConstraintTrigger_a_18052","RI_ConstraintTrigger_a_18053","RI_ConstraintTrigger_a_25702","RI_ConstraintTrigger_a_25703","RI_ConstraintTrigger_c_17742","RI_ConstraintTrigger_c_17743","RI_ConstraintTrigger_c_17747","RI_ConstraintTrigger_c_17748","RI_ConstraintTrigger_c_17752","RI_ConstraintTrigger_c_17753","RI_ConstraintTrigger_c_17757","RI_ConstraintTrigger_c_17758","trg_spcs_updated_at"]}}]
```

Lectura: altas del 14/09 (5) + **28 entre el 30/09 y hoy** = 33 desde el baseline de 210 → 238 ✔ (210 + 28 = 238; las 5
del 14/09 ya estaban en el 210). En `spcs` no hay trigger de auditoría (sólo los RI de las FK y `trg_spcs_updated_at`).

### A.6b Cobertura `studbook_id`

De A.5: `con_studbook_id: 125` de 238 → **113 sin `studbook_id`** (no los ve el índice único).

### A.7 Inscripciones de Wave Rimout, usuarios por rol, canal, tablas auditadas, reuniones abiertas

```sql
select json_build_object(
 'wave_insc', (select json_agg(json_build_object('spc',i.spc_id,'reunion',r.numero,'fecha',r.fecha,'turno',c.numero_turno,'estado',i.estado,'canal',i.canal)) from inscripciones i join carreras c on c.id=i.carrera_id join reuniones r on r.id=c.reunion_id where i.spc_id in ('5ebc5e48-2caf-4c44-be6a-ad75f2716850','f277af1c-a4ac-4a98-87d7-b41871718c8d')),
 'portal_users', (select json_agg(json_build_object('rol',rol,'n',c)) from (select rol,count(*) c from usuarios where activo group by rol) x),
 'insc_canal', (select json_object_agg(coalesce(canal::text,'null'),c) from (select canal,count(*) c from inscripciones group by canal) y),
 'canal_type', (select data_type||'/'||udt_name from information_schema.columns where table_name='inscripciones' and column_name='canal'),
 'audit_tables', (select json_agg(distinct c.relname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where p.proname ilike '%audit%'),
 'reuniones_abiertas', (select json_agg(json_build_object('n',r.numero,'fecha',r.fecha,'estado',r.estado,'ap_min',(select min(apertura_inscripcion) from carreras where reunion_id=r.id),'ci_max',(select max(cierre_inscripcion) from carreras where reunion_id=r.id))) from reuniones r where r.fecha >= '2026-09-25' and not r.es_prueba)
) r;
```

```json
[{"r":{"wave_insc":[{"spc":"f277af1c-a4ac-4a98-87d7-b41871718c8d","reunion":6,"fecha":"2026-06-20","turno":11,"estado":"forfait","canal":"manual"},{"spc":"5ebc5e48-2caf-4c44-be6a-ad75f2716850","reunion":8,"fecha":"2026-08-16","turno":10,"estado":"ratificado","canal":"manual"}],"portal_users":[{"rol":"operador","n":3},{"rol":"super_admin","n":1},{"rol":"propietario","n":5},{"rol":"secretario_carreras","n":2},{"rol":"profesional","n":20}],"insc_canal":{"manual":414,"portal":8},"canal_type":"USER-DEFINED/canal_inscripcion","audit_tables":["carreras","categorias_carrera","clubs","inscripciones","liquidacion_config","liquidaciones","recibos","resolucion_entidades","resoluciones","resultados","reuniones","sanciones","usuarios"],"reuniones_abiertas":[{"n":11,"fecha":"2026-11-22","estado":"programada","ap_min":null,"ci_max":null},{"n":12,"fecha":"2026-12-27","estado":"programada","ap_min":null,"ci_max":null},{"n":10,"fecha":"2026-10-11","estado":"publicada","ap_min":"2026-09-28T03:00:00+00:00","ci_max":"2026-10-02T15:00:00+00:00"}]}}]
```

Lectura: R10 (11/10) tiene la inscripción abierta hasta el **02/10 15:00 UTC** — es la ventana en la que pasó el caso del
audio. Esta feature no llega para R10.

### A.8 Política de INSERT de `inscripciones` y extensiones

```sql
select json_build_object('ext', (select json_agg(extname||' '||extversion) from pg_extension), 'insc_policies', (select json_agg(json_build_object('p',policyname,'cmd',cmd,'chk',with_check,'q',qual)) from pg_policies where tablename='inscripciones' and cmd in ('INSERT','ALL'))) r;
```

```json
[{"r":{"ext":["plpgsql 1.0","pg_stat_statements 1.11","uuid-ossp 1.1","pgcrypto 1.3","supabase_vault 0.3.1"],"insc_policies":[{"p":"inscripciones_insert","cmd":"INSERT","chk":"((NOT ( SELECT fn_is_portal_user() AS fn_is_portal_user)) AND (( SELECT fn_is_super_admin() AS fn_is_super_admin) OR (fn_club_de_carrera(carrera_id) = ( SELECT fn_get_user_club_id() AS fn_get_user_club_id))))","q":null}]}}]
```

(No hay `http` ni `pg_net`.)

### A.9 Edge Functions desplegadas

MCP `list_edge_functions`:

```json
{"functions":[{"id":"01bb9b9a-91c5-4949-a789-e7b8add5ed7b","slug":"reunion-json","name":"reunion-json","status":"ACTIVE","version":22,"created_at":1781233536179,"updated_at":1789163558660,"verify_jwt":false,"import_map":false,"entrypoint_path":"index.ts","ezbr_sha256":"f07f5727b35e3313067eabf63c64d4aaecfbe642fe64ce0ac1217afcba5da75a"},{"id":"d943e302-910f-4edd-bf49-d2ce331e711d","slug":"invite-user","name":"invite-user","status":"ACTIVE","version":5,"created_at":1784845351342,"updated_at":1785289202711,"verify_jwt":true,"import_map":false,"entrypoint_path":"/tmp/user_fn_unlhcuanfrtpatoipwve_d943e302-910f-4edd-bf49-d2ce331e711d_2/source/index.ts","ezbr_sha256":"5b6406c0c8851fa940802b77f3e4de56361b851a525e30dbe40a2a308e4e9f64"},{"id":"29398a3c-bb75-4653-86d0-ccc7c3206b78","slug":"studbook-buscar","name":"studbook-buscar","status":"ACTIVE","version":1,"created_at":1789169607643,"updated_at":1789169607643,"verify_jwt":true,"import_map":false,"entrypoint_path":"index.ts","ezbr_sha256":"eb5ca612438ee29331e8a809e206403cdb96251e0c161cbbf5b49338e0669ade"}]}
```

`get_edge_function studbook-buscar` → un archivo `index.ts`, contenido igual a `supabase/functions/studbook-buscar/index.ts`
de `main` (211 líneas; comparado leyendo, no por hash). Gate de staff, textual:

```ts
    const { data: esStaff, error: staffErr } = await asCaller.rpc('fn_is_staff');
    if (staffErr) { console.error('[studbook-buscar] fn_is_staff:', staffErr.message); return fail(500, 'staff_lookup_failed', 'No se pudo verificar el rol.', origin); }
    if (esStaff !== true) return fail(403, 'solo_staff', 'Esta consulta es para la secretaría.', origin);
```

### A.10 El Stud Book hoy (GET público, sin credenciales, desde el VPS)

```bash
curl -s -m 15 -o sb.json -w "%{http_code} %{content_type} %{time_total}\n" -H 'X-Requested-With: XMLHttpRequest' -H 'Referer: https://www.studbook.org.ar/ejemplares' -A 'Mozilla/5.0' 'https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=WAVE%20RIMOUT'; head -c 700 sb.json
curl -s -m 15 -o /dev/null -w "sin XRW: %{http_code} %{content_type}\n" 'https://www.studbook.org.ar/ejemplares/autocomplete?tipo=1&muerto=1&term=WAVE'
```

```
200 application/json; charset=utf-8 0.894578
[{"icon":"\/img\/banderas\/10.png","id":397805,"text":"WAVE RIMOUT","leyenda":"(2017 M SP)","padre":"Remote (GB)","madre":"Holiday Wave","abuelo_materno":"Harlan's Holiday (USA)","tomo":1209,"folio":804,"sexo":"Macho","nacimiento":"08\/08\/2017","pelo":"Zaino","raza":4,"url_friendly":"wave-rimout","adn":1,"pasaporte":1,"mc":1,"revisado":1}]
sin XRW: 404 text/html; charset=UTF-8
```

→ **Una sola** entrada para WAVE RIMOUT (SB 397805, 08/08/2017, Remote (GB) × Holiday Wave). Las dos filas del padrón son
el mismo caballo.

### A.11 Código citado (de `main` `cf99bf4`)

- `portal.html:270-275` input del buscador; `:360` `TEL`; `:735-740` `cargarPadronSpcs`; `:771-806` búsqueda local;
  `:976-993` mensaje "Ningún caballo del padrón coincide…"; `:1052-1118` `anotar()` → `rpc_inscribir`.
- `spcs.html:155-160` contadores; `:166` filtro de estado; `:538-642` buscador del Stud Book y `usarCandidato`;
  `:648-689` panel de duplicados (comentario equivocado sobre Wave Rimout en ~`:652`); `:691-733` `saveRecord`.
- `inscripciones.html:674-676` celda "Cargada por".
- `supabase/functions/studbook-buscar/index.ts` completo.

---

## Lo que NO se hizo

- Ninguna escritura en la base (todas las consultas son SELECT / catálogo; el MCP devuelve datos, no se aplicó nada).
- Ningún commit en `main`. La rama `reports` local está divergente de `origin/reports` (1155 adelante / 65 atrás): no se
  tocó; este informe se escribió en un worktree aparte sobre `origin/reports`.
- No se probó el INSERT del portal a `spcs` (sería escritura en prod); la conclusión sale de la política.
