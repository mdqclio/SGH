# ¿Quién chocó de verdad con el gate de edad?

| | |
|---|---|
| **Fecha** | 2026-08-27 |
| **SHA del commit** | `bce0819` (este informe, branch `reports`) |
| **Tipo** | Censo de uso real. **Read-only**: sólo `SELECT` por MCP + lectura de logs. Cero DDL, cero DML, cero cambios de código, sin merge a `main`. |
| **Antecedentes** | `2026-08-27_edad-gate-inscripcion.md` (`7de5461`) · `2026-08-27_censo-inscripciones-r9.md` · `2026-08-27_fix-edad-una-sola-vez.md` |

### Guards verificados

```
$ pwd
/home/clio/dev/SGH                       ✅ esperado /home/clio/dev/SGH

SELECT count(*) FROM spcs;
[{"count":181}]                          ✅ esperado 181
```

---

## VEREDICTO

> **Una sola persona pudo chocar con el gate: FABIO JOSE CASTRO, el único usuario de portal que existe en toda la base. Y hay evidencia directa de que chocó: 4 excepciones de `rpc_inscribir` en los logs de Postgres del 26/08 entre las 17:35 y las 17:39 ART, 2 a 5 minutos después de su login. No es capacidad teórica: alguien intentó y rebotó cuatro veces. Lo que los logs NO permiten afirmar es que el motivo haya sido la edad — el mensaje que quedó registrado es el genérico y no dice qué condición falló.**

---

## Números de resumen

| # | | |
|---|---|---|
| **1** | Usuarios de portal en toda la base | **1** (FABIO JOSE CASTRO) |
| **2** | Rechazos de `rpc_inscribir` con evidencia directa en logs | **4** (26/08, 17:35–17:39 ART) |
| **3** | De los 13 SPCs, cuántos tienen entrenador o propietario con usuario de portal | **0 de 13** |
| **4** | Inscripciones por `canal='portal'` en toda la historia | **1** |
| **5** | Solicitudes de acceso desde el 2026-08-01 | **2** (1 aprobada, 1 descartada) |
| **6** | Retención de logs consultable | **24 horas** — el 24 y el 25/08 ya no son recuperables |

---

## 1. Logs de Supabase — hay evidencia directa

### 1.1 Limitación de retención, dicha explícita

El MCP expone dos caminos y **ninguno llega al 24/08**:

- `get_logs` — la propia herramienta declara *"This will return logs within the last 24 hours"*.
- `query_logs` (ClickHouse, ventana arbitraria) — **devuelve `MCP error -32600: You do not have
  permission to perform this action`**. No hay permiso en esta sesión.

👉 **La ventana del 24/08 y el 25/08 NO es recuperable.** Todo lo que sigue cubre únicamente las
últimas 24 horas. Si alguien chocó con el gate el 24 o el 25, no queda rastro consultable y no
lo voy a inventar.

### 1.2 Lo que sí aparece — 4 rechazos reales

`get_logs(service: postgres)`, entradas `error_severity: ERROR`, texto literal:

```
No se puede inscribir: Tu ejemplar no está habilitado para inscribirse. Consultá en secretaría.
```

Cuatro veces. Timestamps convertidos con `to_timestamp(t/1000000.0)`:

| # | UTC | ART |
|---|---|---|
| 1 | 2026-08-26 20:35:48.531 | **2026-08-26 17:35:48** |
| 2 | 2026-08-26 20:36:10.273 | **2026-08-26 17:36:10** |
| 3 | 2026-08-26 20:36:41.248 | **2026-08-26 17:36:41** |
| 4 | 2026-08-26 20:39:04.164 | **2026-08-26 17:39:04** |

Cuatro intentos en 3 minutos y 16 segundos. Es el patrón de alguien probando, no de un proceso.

### 1.3 Qué se puede identificar, y qué no

Los logs de Postgres **no traen `user_id` ni el SPC**: sólo severidad, mensaje y timestamp. Pero
el propio texto del mensaje identifica al tipo de usuario, porque `validar_inscripcion` decide
qué contar según quién pregunta:

```sql
v_detalle BOOLEAN := fn_is_staff();
...
RETURN QUERY SELECT FALSE, CASE WHEN v_detalle
    THEN 'Edad insuficiente: ' || v_edad_carrera || ' años. Mínimo: ' || ...
    ELSE v_generico END;
```

Y `fn_is_staff()` es:

```sql
SELECT EXISTS (SELECT 1 FROM usuarios
  WHERE auth_user_id = auth.uid() AND activo
    AND rol IN ('super_admin','secretario_carreras','operador'));
```

👉 **El mensaje registrado es el genérico, así que quien llamó NO era staff.** Si hubiera sido
Fede (`secretario_carreras`) o Valeria (`operador`), el log diría el motivo detallado.

### 1.4 Correlación con el log de auth

`get_logs(service: auth)` en la misma ventana:

```json
{"action":"login","login_method":"token","time":"2026-08-26T20:33:45Z",
 "user_id":"194f7e35-1647-4997-a7ad-c4b000068672"}
{"actor_username":"hipodromodolores@gmail.com","path":"/token","status":200,
 "remote_addr":"168.181.73.254","referer":"https://sigh.com.ar/","time":"2026-08-26T20:33:45Z"}
```

`194f7e35-…` = `hipodromodolores@gmail.com` = **FABIO JOSE CASTRO**, `rol = 'profesional'`.

**Login 20:33:45 UTC. Primer rechazo 20:35:48 UTC. Dos minutos y tres segundos después.**

Los otros dos usuarios activos en la ventana son staff y quedan descartados por §1.3:

| auth_user_id | email | rol | ¿staff? |
|---|---|---|---|
| `8b2f4c83-…` | fedeiguacel@gmail.com | `secretario_carreras` | sí → recibiría motivo detallado |
| `df8a5983-…` | vale_0735@hotmail.com | `operador` | sí → recibiría motivo detallado |
| `194f7e35-…` | hipodromodolores@gmail.com | `profesional` | **no → recibe el genérico** |

### 1.5 Lo que NO se puede afirmar

- **Qué condición falló.** El genérico tapa el motivo: pudo ser edad, sexo, sanción, estado del
  SPC o cupo. Los logs no lo dicen y no hay forma de recuperarlo.
- **Qué SPC se intentó.** No queda registrado.
- **Si hubo intentos el 24 o el 25.** Fuera de la ventana de retención (§1.1).

---

## 2. Usuarios del portal — hay exactamente uno

```sql
SELECT u.nombre_completo, u.email, u.rol::text, u.entidad_tipo, u.entidad_id::text,
       u.activo, u.estado, u.created_at::text AS alta, u.ultimo_login::text,
       (u.ultimo_login >= '2026-08-24') AS login_post_24ago
FROM usuarios u
WHERE u.rol IN ('profesional','propietario') OR u.entidad_tipo IN ('profesional','propietario')
ORDER BY u.ultimo_login DESC NULLS LAST, u.created_at;
```

```json
[{"nombre_completo":"FABIO JOSE CASTRO","email":"hipodromodolores@gmail.com",
  "rol":"profesional","entidad_tipo":"profesional",
  "entidad_id":"11d8c346-5541-4465-b232-0d0eb39615d2","activo":true,"estado":"activo",
  "alta":"2026-08-19 16:20:49.852203+00","ultimo_login":null,"login_post_24ago":null}]
```

**Una sola fila.** El padrón de usuarios del portal es una persona.

⚠️ **`usuarios.ultimo_login` está en NULL para TODOS los usuarios de la base**, incluidos Fede y
Valeria, que sabemos que entraron ayer. La columna existe pero **no se está poblando**: no sirve
como fuente. Por eso la evidencia de actividad salió del log de auth y no de esta tabla.
(Ver pregunta abierta 3.)

Su ficha profesional:

```json
[{"apellido":"CASTRO","nombre":"FABIO JOSE","tipo":"entrenador","activo":true,
  "caballeriza_id":null,"caballeriza":null,"spcs_a_su_cargo":0}]
```

**Sin caballeriza y con 0 SPCs a su cargo.** Desde la *inscripción libre* del 24/08 eso no lo
limita: cualquier usuario de portal puede anotar cualquier SPC del padrón, y el control es
disciplinario vía `inscripto_por`.

---

## 3. Cruce con los 13 — ninguno tiene usuario propio

```sql
-- los 13: edad reglamentaria = 3 pero el gate calcula distinto, contra la fecha de R9
WITH r9 AS (SELECT fecha FROM reuniones WHERE numero=9),
trece AS (SELECT s.id, s.nombre, s.caballeriza_id, s.entrenador_id FROM spcs s
  WHERE s.fecha_nacimiento IS NOT NULL AND s.estado='activo'
    AND (date_part('year',(SELECT fecha FROM r9)) - date_part('year', s.fecha_nacimiento))::int = 3
    AND DATE_PART('year', AGE((SELECT fecha FROM r9), s.fecha_nacimiento))::int <> 3)
SELECT t.nombre, cab.nombre, pe.apellido||', '||pe.nombre, pr.nombre,
       (ue.id IS NOT NULL), (up.id IS NOT NULL), ue.ultimo_login, up.ultimo_login
FROM trece t
LEFT JOIN caballerizas cab ON cab.id = t.caballeriza_id
LEFT JOIN profesionales pe ON pe.id = t.entrenador_id
LEFT JOIN caballeriza_responsables cr ON cr.caballeriza_id = t.caballeriza_id AND cr.rol='propietario' AND cr.activo
LEFT JOIN propietarios pr ON pr.id = cr.propietario_id
LEFT JOIN usuarios ue ON ue.entidad_tipo='profesional' AND ue.entidad_id = t.entrenador_id AND ue.activo
LEFT JOIN usuarios up ON up.entidad_tipo='propietario' AND up.entidad_id = cr.propietario_id AND up.activo
ORDER BY t.nombre;
```

| caballo | caballeriza | entrenador | propietario | ent. c/usuario | prop. c/usuario | login post 24/08 |
|---|---|---|---|:--:|:--:|:--:|
| Berry Nik | El Capitan | CUEVAS, CESAR DANIEL | — | ❌ | ❌ | — |
| Cursi Nik | — | — | — | ❌ | ❌ | — |
| DOCTORA APASIONADA | LA NARCISA | CARLI, FEDERICO | CARLI, ORNELA | ❌ | ❌ | — |
| Es Mistres | EL GALPON LOBOS (DOL) | BRIGANTI, MARIA LAURA | — | ❌ | ❌ | — |
| First Queen | — | — | — | ❌ | ❌ | — |
| GREAT ORPEN | AMORES MIOS | DIESTRA, CLAUDIO MAXIMILIANO | — | ❌ | ❌ | — |
| Malenuchi Jack | — | — | — | ❌ | ❌ | — |
| MONADESEDA | SACRIFICIO | DIESTRA, JUAN DOMINGO | — | ❌ | ❌ | — |
| **MOSQUITA GARDEN** | LAGUNA VERDE | MAITIA, LUIS | LAGUNA VERDE | ❌ | ❌ | — |
| PUNAB | — | — | — | ❌ | ❌ | — |
| QUIET SANTINA | CARLITOS E | CANTO, TOMAS | — | ❌ | ❌ | — |
| SI TIN | SAICA | FARIAS, OSVALDO ISMAEL | — | ❌ | ❌ | — |
| TIRSO | PARAJE LA TABLADA | MALENA, GUSTAVO | — | ❌ | ❌ | — |

**0 de 13.** Ninguno de esos caballos tiene a su entrenador ni a su propietario con usuario de
portal. 4 de los 13 ni siquiera tienen caballeriza cargada.

⚠️ **Pero eso NO cierra el caso, y es importante no leerlo de más.** Con *inscripción libre*
(24/08), quien anota no necesita ninguna relación con el caballo: **Fabio pudo intentar anotar
cualquiera de los 13**. La hipótesis de la consigna — *"si ninguna tiene usuario, nadie pudo
intentar y el daño real es cero"* — **no se sostiene bajo la regla vigente**. Habría sido
correcta antes del 24/08, cuando el gate exigía tenencia.

Lo que sí queda establecido: **ninguno de los 13 propietarios/entrenadores pudo intentarlo por
su cuenta.** Si alguien lo intentó, fue Fabio en nombre de ellos.

---

## 4. Solicitudes de acceso — no hubo pico

```sql
SELECT id::text, nombre, apellido, email, rol_pedido::text, estado::text,
       origen_caballeriza, created_at::text, resuelta_at::text
FROM solicitudes_acceso WHERE created_at >= '2026-08-01' ORDER BY created_at;
```

| fecha | nombre | rol pedido | estado | caballeriza de origen |
|---|---|---|---|---|
| 2026-08-04 04:28 | Leonardo Fernandez (`mdqclio@hotmail.com`) | propietario | `descartada` | `null` |
| 2026-08-19 16:15 | FABIO JOSE CASTRO (`hipodromodolores@gmail.com`) | profesional | `aprobada` | `null` |

**Dos solicitudes en todo agosto, y ninguna después del 24/08.** No hay pico, no hay gente
enterándose del portal. Ninguna corresponde a las 13 caballerizas (las dos tienen
`origen_caballeriza = null`, y la única aprobada es Fabio, sin caballeriza asignada).

La del 04/08 es del propio usuario de esta sesión y está descartada.

---

## 5. Actividad real del portal — una sola inscripción en la historia

```sql
SELECT i.id::text, i.created_at::text, i.canal, i.estado::text, u.nombre_completo AS anoto,
       s.nombre AS spc, s.fecha_nacimiento::text, r.numero AS reunion, c.numero_turno,
       c.edad_minima_anos, c.edad_maxima_anos
FROM inscripciones i
JOIN carreras c ON c.id=i.carrera_id JOIN reuniones r ON r.id=c.reunion_id
JOIN spcs s ON s.id=i.spc_id LEFT JOIN usuarios u ON u.id=i.inscripto_por
WHERE i.canal='portal' ORDER BY i.created_at;
```

```json
[{"id":"da791e64-9262-4af8-b9c2-f5ffcecd44ff","created_at":"2026-08-25 18:26:02.340134+00",
  "canal":"portal","estado":"inscripto","anoto":"FABIO JOSE CASTRO",
  "spc":"Amiguito Peligroso","fecha_nacimiento":"2023-07-07",
  "reunion":9,"numero_turno":1,"edad_minima_anos":3,"edad_maxima_anos":3}]
```

**Una fila. En toda la base. De toda la historia.** Y la hizo el mismo Fabio.

Contraste con lo que ya sabíamos: R8 tuvo **106 inscripciones, todas `canal='manual'`, cero por
portal**. El canal está prácticamente muerto: 1 inscripción exitosa y 4 rechazos, todo de la
misma persona.

---

## 6. Reconstrucción de lo que pasó

| cuándo | qué |
|---|---|
| 19/08 16:15 | Fabio pide acceso al portal |
| 19/08 16:20 | Se le aprueba (5 minutos después) |
| 24/08 00:00 | Abre la ventana de inscripción del turno 1 de R9 (3/3) |
| **25/08 18:26** | Fabio anota **Amiguito Peligroso** — **funciona**. Nacido 07/07/2023, cinco días después del corte: es de los casos donde las dos fórmulas coinciden. |
| **26/08 20:33:45** | Fabio vuelve a entrar (`sigh.com.ar`, IP 168.181.73.254) |
| **26/08 20:35:48** | ❌ rechazo 1 |
| **26/08 20:36:10** | ❌ rechazo 2 |
| **26/08 20:36:41** | ❌ rechazo 3 |
| **26/08 20:39:04** | ❌ rechazo 4 |
| 27/08 | (hoy) Yesi habilita los 11 turnos |

La lectura razonable — **y es lectura, no dato**: la primera vez le funcionó porque el caballo
que eligió cae en el caso donde el bug no muerde. Al día siguiente volvió a probar con otros y
rebotó cuatro veces seguidas. Pero **el log no dice qué caballos ni por qué condición**, y no lo
voy a completar por inferencia.

---

## 7. Preguntas abiertas

1. **¿Se le pregunta a Fabio qué intentó anotar el 26/08 a las 17:35?** Es la única forma de
   saber si fue la edad. Cuatro intentos en 3 minutos: se debe acordar. Es el testimonio que
   los logs no pueden dar.
2. **¿Se agrega registro de rechazos?** Hoy un `RAISE EXCEPTION` no deja fila en `auditoria` y
   el log de Postgres se pierde a las 24 horas. Con el gate arreglado el problema se achica,
   pero cualquier rechazo futuro va a ser igual de invisible.
3. **`usuarios.ultimo_login` no se está poblando.** Está en NULL para todos, incluidos usuarios
   que entraron ayer. O se popula en el login, o se saca la columna: hoy es una trampa para
   quien la consulte creyendo que dice algo.
4. **¿El mensaje genérico sigue siendo lo que queremos?** El comentario en
   `validar_inscripcion` dice *"Texto provisorio hasta que Fede defina qué se le puede decir al
   portal"*. Ese genérico es justamente lo que impide saber hoy por qué rebotó Fabio — le cuesta
   al usuario y le cuesta al diagnóstico.
5. **El canal portal tiene 1 usuario.** Antes de invertir más en el portal, la pregunta de
   producto es si se va a poblar de verdad. Con un usuario, el impacto de cualquier bug del
   portal es acotado — y el del gate de edad también.
