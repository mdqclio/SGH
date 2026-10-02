# Alta de SPC desde el modal "Inscribir SPC" del staff (Stud Book en el mismo paso): Fase 1, propuesta

- **Fecha**: 2026-10-02
- **Código leído**: `main` = `c28d8bee35c4304109ac7e6b763129f1b0a2c574`. Se leyeron `inscripciones.html`, `portal.html` y
  `supabase/functions/studbook-buscar/index.ts`. El cuerpo de `rpc_spc_alta_studbook_portal` y el de `fn_spcs_alta_revision`
  se leyeron **de prod** (`pg_get_functiondef`), no del archivo.
- **Sólo lectura.** No se escribió código, ni se hizo ninguna migración ni ningún deploy. **Espera OK.**
- **Guards**: pwd `/home/clio/dev/SGH`; ref `unlhcuanfrtpatoipwve`; club Dolores = 1 fila (verificado en la sesión).
- Pedido: lo que hoy Yesi carga dos veces (primero en SPCs y después en Inscripciones) se hace en un paso desde el modal.
  Se reusa la Edge Function y la RPC del portal, sin duplicar lógica. Si el caballo ya está en el padrón, se usa ese (D2).
  Duplicados (D3) y edad, igual que en el portal. El alta del staff **no** queda pendiente de revisión, **no** tiene cupo
  diario y **sí** registra quién la hizo.

## 1. Cómo es hoy

**Modal del staff** (`inscripciones.html`):

- `searchSpc()` (`:720`) busca **sólo en el padrón**: `spcs` activos, `ilike` del nombre, 10 resultados.
- Si no hay coincidencias muestra "Sin resultados" y no ofrece otra salida.
- Al guardar, `saveRecord()` hace un `INSERT` directo en `inscripciones` con el cliente del usuario (RLS de staff).

**Portal** (`portal.html:1130-1250`):

- `buscarEnStudBookPortal()` llama a `studbook-buscar { term }` y muestra los candidatos.
- Si un candidato ya está en el padrón (mismo `studbook_id`), el botón dice "Ya está en el padrón — anotarlo".
- Si no, "Es este — anotarlo" llama a `traerYAnotar()`, que pide `studbook-buscar { accion:'traer', sb_id, nombre,
  carrera_id }`.
- La Edge Function vuelve a pedirle los datos al Stud Book (el navegador **no** manda los datos del caballo) y llama a
  `rpc_spc_alta_studbook_portal` con la key secreta.
- Con el `spc_id` que vuelve, el portal llama a `anotar()` de siempre.

**La RPC en prod** tiene esta secuencia de chequeos:

- **G0**: sólo `service_role`.
- **G1**: el usuario tiene que ser **de portal** (`rol IN ('profesional','propietario')` con entidad).
- **V1**: la ventana de inscripción del turno tiene que estar abierta.
- **V2–V6**: forma de los datos del Stud Book (nº, raza = 4, nombre, fecha, sexo).
- **V7**: edad reglamentaria. Menos de 2 años se rechaza; más de 12 se crea con motivo.
- **Lock** por nombre normalizado.
- **D1**: mismo `studbook_id`: devuelve ese.
- **D2**: misma fecha, padre y madre con 1 coincidencia: devuelve esa.
- **D3**: más de 1 coincidencia: se rechaza.
- **R1**: cupo de 3 altas por usuario cada 24 h.
- **D4**: homónimo: se crea con motivo.
- **W**: INSERT con `alta_origen='portal'`, `alta_por`, `revision_pendiente=true` y `revision_motivos`.

**Trigger `fn_spcs_alta_revision`**: en un INSERT **sin** la marca `sgh.alta_portal` impone `alta_origen='secretaria'`,
`alta_por = usuario de la sesión` y `revision_pendiente=false`. Con service_role no hay sesión, así que `alta_por` quedaría
NULL. Por eso la RPC pone la marca y escribe `alta_por` ella misma. `CHECK alta_origen IN ('secretaria','portal')`.

## 2. Propuesta (recomendada): la MISMA RPC y la MISMA Edge Function, con una rama de staff

### 2.1 RPC `rpc_spc_alta_studbook_portal` v2

Se hace con `CREATE OR REPLACE`, **la misma firma**, y el nombre se mantiene para no romper el contrato con la Edge
Function. El modo **no** lo manda el navegador ni la Edge Function: lo decide la RPC leyendo `usuarios.rol` del
`p_auth_user_id`.

| paso | portal (como hoy) | **staff** (nuevo) |
|---|---|---|
| G0 | service_role | igual |
| G1 | usuario activo de portal con entidad | usuario activo con `rol IN ('super_admin','secretario_carreras','operador')` |
| G1b club | — | el club del turno tiene que ser el del usuario (salvo super_admin), con el patrón de las RPC de plata |
| V1 ventana | inscripción abierta | **no se exige la ventana**, porque el staff inscribe fuera de ella (el modal de hoy no la mira). Sí se exige que el turno exista, no esté anulado y que la reunión no esté anulada/cancelada |
| V2–V6 | igual | igual |
| V7 edad | <2 rechaza, >12 motivo | **igual** |
| D1/D2 | devuelve el existente | **igual** (D2: "si ya está en el padrón, usar ese") |
| D3 | rechaza | **igual** |
| R1 cupo | 3 por día | **no aplica** |
| D4 homónimo | crea con motivo | crea, y el motivo vuelve a la pantalla como aviso |
| W | `alta_origen='portal'`, `revision_pendiente=true` | `alta_origen='secretaria'`, **`revision_pendiente=false`**, `alta_por` = id del usuario staff, `revision_motivos` = los motivos (informativo; no lo marca "Por revisar") |
| notas | "alta desde el portal por …" | "alta desde Inscripciones por …", con el mismo formato que `spcs.html` |

La marca `sgh.alta_portal` se usa en las dos ramas, porque es lo que deja escribir `alta_origen` y `alta_por` a mano.
Ojo: el nombre de la marca queda viejo. Lo dejo así para no tocar el trigger; si se prefiere, se renombra en la misma
migración.

**Quién la creó**: `spcs.alta_por` = el usuario staff. La fila de `auditoria` del INSERT queda sin usuario, igual que
hoy en el portal, porque la RPC corre como service_role. Si se quiere el usuario también en la auditoría, se resuelve aparte
(ISSUE nuevo); no lo propongo ahora.

### 2.2 Edge Function `studbook-buscar` v3

- **`traer`**: hoy es `if (!esPortal) → 403 solo_portal` y pasa a `if (!esPortal && !esStaff) → 403`. El resto queda igual:
  vuelve a pedir los datos al Stud Book, usa la key secreta, y `paramsAlta(cand, auth user id, carreraId)`.
- **El contrato no cambia**: `{ ok, spc_id, ya_existia, revision_motivos, nombre }`.
- Se actualiza el comentario del encabezado: "traer: portal **y staff**".

### 2.3 Pantalla `inscripciones.html` (rama nueva desde `main`, con el listado #46 ya mergeado)

1. En el dropdown del buscador, cuando hay "Sin resultados" (y también al pie cuando hay pocos), aparece el botón
   **"🔎 Buscar «texto» en el Stud Book"**.
2. Lista de candidatos con nombre, sexo, edad, pelaje, padre × madre y nº de Stud Book, igual que el portal:
   - si el candidato ya está en el padrón por `studbook_id`: **"Ya está en el padrón — usar"**, que va a `selectSpc` sin
     llamar al alta;
   - si no: **"Es este — usar"**, que llama a `traer`. Con el `spc_id` que vuelve, el SPC queda **seleccionado en el modal**
     (`selectSpc`). Yesi completa caballeriza, jockey, etc., y guarda como siempre.
3. La inscripción **no** se hace automáticamente (a diferencia del portal), porque el modal del staff tiene más campos.
   Si cierra sin guardar, la ficha queda creada, igual que si la hubiera cargado en SPCs.
4. Mensajes:
   - "ya estaba en el padrón" cuando vuelve D1 o D2;
   - el texto del rechazo cuando es D3 o edad menor de 2;
   - los motivos como aviso (homónimo, más de 12 años).
5. El portal **no se toca**. El código de candidatos es chico (unas 60 líneas) y lo repito en `inscripciones.html` siguiendo
   el patrón del portal. La lógica de negocio (duplicados, edad, alta) queda **sólo** en la RPC. Si después se quiere
   un `studbook-candidatos.js` compartido, se hace como refactor aparte.

### 2.4 Alternativa descartada

La otra opción era que el staff hiciera el INSERT directo, como hoy `spcs.html`: buscar con la Edge Function,
`rpc_spcs_duplicados` y después el INSERT con el cliente. La descarto por tres razones:

- duplica las reglas de duplicado y de edad en la pantalla;
- `rpc_spcs_duplicados` tiene otro criterio ("Guardar igual");
- confía en los datos del caballo que manda el navegador.

El pedido es explícito: reusar la RPC del portal.

## 3. Verificación prevista

- **Sandbox** (`tests/local/portal_alta_spc_sandbox.sql`): aplicar la v2 y medir el md5 de `pg_get_functiondef` como
  esperado. `probe_portal_alta_spc_studbook` hoy da 55/55 y 23/23 mutantes:
  - los casos del portal tienen que seguir iguales;
  - casos nuevos de staff: staff de otro club → 42501; super_admin de cualquier club OK; fuera de ventana OK; turno anulado
    → rechazo; edad <2 → rechazo; D1/D2 devuelven el existente; D3 rechaza; 4 altas seguidas sin cupo; `alta_origen`
    'secretaria', `revision_pendiente` false, `alta_por` = staff; un operador inactivo → 42501;
  - mutantes nuevos: sin G1b, cupo aplicado al staff, pendiente=true para el staff, modo tomado de un parámetro.
- **Edge Function**: extender `probe_studbook_buscar_fn` (lógica extraída) y `probe_studbook_buscar_e2e` (deployada): traer
  como staff → 200; como anon → 401; como usuario sin fila → 403.
- **Pantalla**: probe jsdom nuevo `probe_inscripciones_alta_studbook` con `sb` stub. Casos: botón con "Sin resultados",
  candidatos, "ya en padrón" sin llamar a traer, traer selecciona el SPC, errores traducidos. Con mutantes.
- **Prod**: en el patrón de `probe_portal_alta_spc_prod`, con sesión staff sobre la 9999 y teardown por estado; la ficha
  creada es fixture y se borra.
- `correr_todos.sh` antes del merge; deploy de Edge Function, migración y HTML fuera del horario de Yesi. El orden es
  migración, después Edge Function, después HTML, porque la pantalla sin la Edge Function nueva recibiría un 403.

## 4. Preguntas para el OK

1. **Ventana**: ¿el staff puede traer y crear un caballo para un turno con la inscripción cerrada? Propongo **sí** (hoy
   inscribe fuera de ventana), sólo con el turno no anulado.
2. **Homónimo o más de 12 años**: ¿alcanza con el aviso después de crear, o querés una confirmación antes de crear?
   Propongo aviso después, porque la ficha se edita en SPCs.
3. **`revision_motivos`** en altas del staff: ¿guardarlos (informativo, sin "Por revisar") o dejarlos vacíos? Propongo
   guardarlos.
4. ¿Renombrar la marca `sgh.alta_portal` → `sgh.alta_studbook` en la misma migración? Propongo no tocarla.
