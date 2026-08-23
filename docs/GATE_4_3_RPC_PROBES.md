# Gate 4.3 — RPC de inscripción + probes · ✅ **APLICADO Y VERDE**

**Fecha**: 2026-08-06 · **Branch**: `sec/autoregistro-gate-4` · **Ref**: `unlhcuanfrtpatoipwve`
**Guard**: `pwd = /home/clio/dev/SGH`, `spcs = 163` ✅ · parte de `main` @ `d8472c0`

> 🔴 **Nada en `main`.** Todo vive en la branch. El merge lo decide Fede el **lunes 17**, después de la reunión.
> Las **funciones y la policy sí están vivas en la base** — no hay branch de datos. Ver §5 (por qué es seguro) y §6 (rollback).

---

## 1. Resultado en una línea

🟢 **30 asserts en verde, 0 en rojo.** `probe_gate4_inscribir` 15/15 y `probe_rls_portal` 37/37 (incluidos los 11, 12 y 14 que estaban pendientes o fallando). Un entrenador puede anotar sus caballos desde el portal, no puede anotar los de otro, no puede anotarse fuera de ventana, y no puede borrar el trabajo de la secretaría.

---

## 2. Lo que se aplicó

| migración (MCP) | archivo versionado | qué |
|---|---|---|
| `canal_inscripcion_add_portal` | `migrations/canal_portal.sql` | valor `'portal'` en el ENUM |
| `backfill_tenencia_spcs_gate41` | `migrations/backfill_tenencia_spcs.sql` | gate 4.1 |
| `rpc_inscribir_gate4` + `rpc_inscribir_fix_inscripto_por` | `migrations/rpc_inscribir.sql` | el RPC de inscripción |
| `rpc_baja_inscripcion_gate4` + `rpc_baja_inscripcion_fix_inscripto_por` | `migrations/rpc_baja_inscripcion.sql` | la baja propia |
| `inscripciones_select_portal_gate4` | `migrations/inscripciones_select_portal.sql` | policy de SELECT |

---

## 3. 🐛 El bug que encontró el probe — `inscripto_por` no es `auth.uid()`

El plan (§C.4) decía escribir `inscripto_por = auth.uid()`. **Está mal**, y el probe lo agarró en el primer assert:

```
insert or update on table "inscripciones" violates foreign key
constraint "inscripciones_inscripto_por_fkey"
```

```sql
FOREIGN KEY (inscripto_por) REFERENCES usuarios(id)
```

`inscripto_por` apunta a **`usuarios(id)`**, no a `auth.users`. Los dos son UUID, así que el error no aparece hasta que se ejecuta contra datos reales — ninguna revisión de código lo hubiera visto.

**Fix**: los dos RPC resuelven primero

```sql
SELECT u.id INTO v_usuario_id
  FROM usuarios u WHERE u.auth_user_id = auth.uid() AND u.activo;
```

y usan `v_usuario_id`. En `rpc_baja_inscripcion` era más silencioso todavía: comparar `inscripto_por` contra `auth.uid()` **nunca matchea**, así que el entrenador no habría podido retirar ni su propia inscripción — sin error visible, sólo un "esa inscripción no la cargó usted" que sería mentira.

Es exactamente el motivo por el que este gate iba plan-first y con probes contra prod.

---

## 4. Los 15 asserts de `probe_gate4_inscribir`

```
── Camino feliz ──
  ✅ G1. entrenador con tenencia inscribe su caballo con la ventana abierta
  ✅ G2. la fila nace con canal=portal, inscripto_por=usuarios.id del que llamó y estado=inscripto
  ✅ G3. entrenador_id y caballeriza_id copiados del SPC
── Multi-categoría: PERMITIDO (GOTCHAS #69) ──
  ✅ G4. el MISMO caballo en 2 carreras de la MISMA reunión: las dos aceptadas
  ✅ G5. el mismo caballo DOS VECES en la misma carrera: rechazado
── Tenencia ──
  ✅ G6. A NO puede inscribir un caballo AJENO (de B)
── Ventana ──
  ✅ G7. ventana CERRADA (cierre en el pasado): rechazado
  ✅ G8. ventana SIN CARGAR (apertura/cierre NULL): rechazado — fail-closed
  ✅ G9. reunión en BORRADOR con ventana abierta: rechazado
  ✅ G10. carrera ANULADA con ventana abierta: rechazado
── Reglas de la carrera ──
  ✅ G11. SPC macho en carrera de hembras: rechazado por validar_inscripcion
── Baja ──
  ✅ G12. el entrenador retira su PROPIA inscripción con la ventana abierta
  ✅ G13. NO puede borrar una inscripción cargada por la SECRETARÍA (canal=manual)
  ✅ G14. NO puede retirar con la ventana ya CERRADA (eso es forfait, fuera de v1)
── El back office no entra por acá ──
  ✅ G15. un usuario STAFF llamando rpc_inscribir: rechazado

  PASS 15   FAIL 0
```

**G4 es el que confirma GOTCHAS #69**: el mismo `spc_id` en dos turnos de la misma reunión queda con **2 filas**, aceptadas las dos. No hay validación por reunión ni constraint nuevo. La resolución del lunes la sigue haciendo la secretaría.

**G11**: `validar_inscripcion` ahora sí bloquea. En `portal.html:560` nunca lo hizo — leía `.valido`, un campo que la función no devuelve.

Dos notas de honestidad sobre el probe:

- **G3** verifica que `entrenador_id` y `caballeriza_id` se copian del SPC. **No** assertea `propietario_id`: la caballeriza fixture no tiene responsables cargados, así que el trigger lo deja en `NULL`. Eso no es un fallo del RPC, y afirmarlo verde exigiría montar `caballeriza_responsables` de mentira. El probe lo informa por pantalla y no lo cuenta como assert.
- **G15** usa la cuenta real de secretaría vía magic link (no crea usuarios staff). El RPC la rechaza en la validación 1.

---

## 5. `probe_rls_portal` — 37/37, y el hueco que se cerró

```
✅ 11. rpc_inscribir rechaza un SPC ajeno
✅ 12. rpc_inscribir rechaza fuera de ventana (carrera sin apertura/cierre → fail-closed)
✅ 14. A NO ve la inscripción de B          ← assert NUEVO

RESULTADO: 37 PASS · 0 FAIL · 0 PENDIENTE
```

El **assert 14 es nuevo y antes fallaba**: `inscripciones_select` era club-wide y no excluía al portal, así que un usuario de portal leía **todas** las inscripciones del club. Hueco preexistente, no lo introducía el gate — pero "Mis inscripciones" lo iba a poner en pantalla, así que se cerró acá.

**Regresión del back office verificada aparte**: con la sesión real de `dolores@sgh.com`, la secretaría sigue viendo **198 de 198** inscripciones y las 38 carreras. La policy nueva no le sacó nada.

---

## 6. Estado de los datos de producción — sin residuo

| | |
|---|---:|
| `inscripciones` totales | 198 |
| con `canal = 'portal'` | **0** |
| con `inscripto_por` no nulo | **0** |
| usuarios / SPCs / profesionales / caballerizas `PROBE-%` | **0** |
| reuniones fixture 9994/9995 | **0** |

Los probes limpian todo lo suyo. **No queda una sola fila de prueba en producción.**

> 🐛 **Fix de teardown, hecho en el camino.** La primera corrida dejó 2 cuentas huérfanas: `auditoria.usuario_id` es FK a `usuarios`, y como el probe genera auditoría en cuanto inscribe, el `DELETE FROM usuarios` fallaba. Se limpiaron a mano (4 filas de auditoría + 2 usuarios) y el teardown ahora borra la auditoría de **sus** usuarios fixture antes. Verificado con una corrida limpia posterior.

> ⚠️ Las 12 inscripciones que aparecieron hoy (186 → 198) son de la secretaría, no del probe: todas `canal='manual'` con `inscripto_por` nulo.

---

## 7. Cómo correrlo

```bash
set -a; . ./.env; set +a
node tests/probe_gate4_inscribir.mjs     # 15 asserts
node tests/probe_rls_portal.mjs          # 37 asserts
```

Turnstile bloquea `grant_type=password`, así que los probes abren sesión con **magic link** (`generateLink` + `verifyOtp`), igual que `probe_autoregistro_e2e`. Está anotado en el encabezado del archivo.

---

## 8. Rollback

En orden inverso:

```sql
DROP POLICY IF EXISTS inscripciones_select ON inscripciones;
CREATE POLICY inscripciones_select ON inscripciones
  FOR SELECT TO authenticated
  USING ((SELECT fn_is_super_admin())
         OR fn_club_de_carrera(carrera_id) = (SELECT fn_get_user_club_id()));

DROP FUNCTION IF EXISTS public.rpc_baja_inscripcion(uuid);
DROP FUNCTION IF EXISTS public.rpc_inscribir(uuid, uuid);
```

Y el backfill con `migrations/rollback_tenencia_spcs.sql`.

El valor `'portal'` del ENUM **no se puede quitar** (Postgres no lo permite sin recrear el tipo). Queda sin usar y no molesta a nadie.

**Por qué esto es seguro aunque no esté mergeado**: las tres piezas vivas en la base son **inertes mientras no haya un usuario de portal vinculado**, y hoy hay **0** (`usuarios` con `entidad_tipo`+`entidad_id` = 0). Los RPC exigen esa vinculación en la primera validación. La policy de SELECT sólo agrega una rama para `fn_is_portal_user()`, que hoy es falso para todos. Ninguna pantalla del back office llama a estas funciones.

---

## 9. Lo que falta del Gate 4

| gate | estado |
|---|---|
| 4.0 plan | ✅ |
| 4.1 backfill de tenencia | ✅ aplicado y verificado |
| **4.2 ventana editable con la reunión publicada** | ⏸ **esperando la respuesta de Yesi** |
| 4.3 RPC + policy + probes | ✅ aplicado, 30/30 verde |
| 4.4 UI `portal.html` | ✅ hecho, 14/14 — ver `docs/GATE_4_4_UI_PORTAL.md` |

**El 4.2 es bloqueante para usar esto de verdad**: hoy la secretaría no puede abrir la ventana en una reunión ya publicada, y sin ventana cargada el RPC rechaza todo (fail-closed, que es el lado correcto para fallar). Los probes se las arreglan porque crean sus propias carreras con ventana.

---

## 10. Congelamiento de `main`

Desde el **viernes al mediodía hasta el lunes 17**: nada a `main`, ni siquiera docs — el domingo es el hito y no queremos un deploy de Pages cerca. Este gate no lo toca: todo vive en `sec/autoregistro-gate-4`.
