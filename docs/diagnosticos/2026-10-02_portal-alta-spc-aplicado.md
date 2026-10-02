# Portal — alta de SPC desde el Stud Book: APLICADO en prod (previa + migración + función v2 + merge PR #29)

- **Fecha:** 2026-10-02, 00:13–00:24 UTC (21:13–21:24 del 01/10 en Argentina)
- **Pedido:** OK a la opción A del informe `2026-10-01_portal-alta-spc-aplicacion-bloqueada.md`, cerrando también
  `bak_r8_propietario` y `_gate41_backfill_tenencia`; orden previa sandbox → previa prod → get_advisors → paso 1 → paso 2 →
  paso 3; paso 3 sin R10, con fixture y teardown, ninguna alta real en `spcs`; v_inscriptos_carrera y las 26 SECURITY DEFINER
  anotadas aparte.
- **Resultado:** todo OK. Nada de rollback.

## SHA / versión de cada paso

| Paso | Qué | Referencia | Verificación |
|---|---|---|---|
| — | grep de uso de las 3 tablas | `origin/main` = `cf99bf4` | sólo `docs/` y `migrations/` (§1) |
| previa · sandbox | `migrations/cerrar_tablas_bak_publicas.sql` | rama `ae468d3` | probe 55/55, 23/23 mutantes; rollback probado (§2) |
| previa · prod | `apply_migration cerrar_tablas_bak_publicas` | **`20261002001531`** | jsonb + 2 ids, RLS ×3, 0 privilegios anon/auth, 2/67/148 (§3) |
| advisors | `get_advisors security` | — | los 3 `rls_disabled_in_public` (ERROR) **desaparecieron** (§3.2) |
| 1 | `apply_migration portal_alta_spc_studbook` | **`20261002001639`** | md5 = sandbox: `cd33a768…` / `704f4762…`; EXECUTE sólo service_role (§4) |
| 2 | `deploy_edge_function studbook-buscar` | **v2**, `ezbr_sha256 c179f071b76538e6da97959ebf36b6080248ea66f92096093b735302ce526a16`, `verify_jwt: true` | staff idéntico a la v1 en 7 términos; e2e 13/13 (§5) |
| 3 | merge PR #29 | **`c868ecc9334d8df4773c5895addf6e7ff162c194`** (rama `ab10eef`) | Pages: 4 HTML md5 = `c868ecc` (§6) |
| 3 | prueba en `sigh.com.ar` | probe `tests/probe_portal_alta_spc_prod.mjs` (PR #30, `c710339`, **sin mergear**) | 14/14: normal + nueva, teardown, spcs 238 → 238 (§7) |

PR #30 (`chore/probe-portal-alta-spc-prod`, sin mergear): el probe del paso 3 + ISSUE-098 (vista SECURITY DEFINER),
ISSUE-099 (26 SECURITY DEFINER ejecutables por anon) e ISSUE-100 (Wave Rimout) en `docs/ISSUES.md`.

## 1. Grep previo (pedido) — las 3 tablas en `main`

`git grep -n <tabla> origin/main` para `_bak_merge_duplicados_spc`, `bak_r8_propietario`, `_gate41_backfill_tenencia`: todas las
coincidencias están en `docs/*.md` y `migrations/*.sql` (ningún `.html`, `.js`, `supabase/functions/` ni `tests/`). En la base
(MCP): `funciones_que_las_nombran: null`, `vistas_que_las_nombran: null`, única FK `_gate41_backfill_tenencia → spcs`
(`_gate41_backfill_tenencia_spc_id_fkey`), conteos 2 / 148 / 67, las tres sin RLS y 0 políticas.

## 2. Previa en el sandbox

- El fixture `tests/local/portal_alta_spc_sandbox.sql` ahora tiene las tres tablas como en prod (tipo fila, sin RLS, GRANT
  completo, 2/67/148). Con eso la migración de la feature **reproduce el error de prod** (`B0`).
- Probe `tests/probe_portal_alta_spc_studbook.mjs --mutantes`: **55/55, 23/23 mutantes** (M22/M23 son de la previa).
- Rollback de la previa probado: tipo `spcs` y sin RLS de vuelta, 42 grants y las 2 fichas legibles como `(fila).nombre`.

## 3. Previa en prod

### 3.0 Actividad justo antes (MCP)

```json
[{"ahora":"2026-10-02 00:15:17.331945+00","insc_2h":0,"insc_15min":0,"audit_15min":0,"spcs":238,"last_mig":"20260927223704","conteos_bak":["2","67","148"]}]
```

### 3.1 `apply_migration cerrar_tablas_bak_publicas` → `{"success":true}`. Verificación (MCP):

```json
[{"r":{"tipo_fila":"jsonb","ids":"0dc2f58f-0e2f-4915-be79-a7515fdd6ee4,da839b11-00a3-4eb8-b09f-03790d425ed9","nombres":"Fist Queen,Malenuchi","rls":{"_bak_merge_duplicados_spc":true,"_gate41_backfill_tenencia":true,"bak_r8_propietario":true},"priv_anon_auth":0,"conteos":[2,67,148],"usan_rowtype_spcs":null,"pol":"b277600da61ecda6e6b1e2250e508fa6","migs":["20261002001531 cerrar_tablas_bak_publicas"],"spcs":238}}]
```

### 3.2 `get_advisors security` después de la previa (leído completo)

```
leído completo: 81460 caracteres; 75 hallazgos
41 authenticated_security_definer_function_executable WARN
26 anon_security_definer_function_executable WARN
6 rls_enabled_no_policy INFO
1 security_definer_view ERROR
1 auth_leaked_password_protection WARN
--- ERROR / INFO / Auth:
INFO rls_enabled_no_policy | Table \`archive.backup_inscripciones_20260515\` has RLS enabled, but no policies exist
INFO rls_enabled_no_policy | Table \`archive.backup_spcs_20260515\` has RLS enabled, but no policies exist
INFO rls_enabled_no_policy | Table \`public._bak_merge_duplicados_spc\` has RLS enabled, but no policies exist
INFO rls_enabled_no_policy | Table \`public._gate41_backfill_tenencia\` has RLS enabled, but no policies exist
INFO rls_enabled_no_policy | Table \`public.bak_r8_propietario\` has RLS enabled, but no policies exist
INFO rls_enabled_no_policy | Table \`public.spc_entrenadores_hist\` has RLS enabled, but no policies exist
ERROR security_definer_view | View \`public.v_inscriptos_carrera\` is defined with the SECURITY DEFINER property
WARN auth_leaked_password_protection | Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security.
```

Antes (01/10, mismo método): 3 × `rls_disabled_in_public` ERROR (`bak_r8_propietario`, `_gate41_backfill_tenencia`,
`_bak_merge_duplicados_spc`). Ahora: 0; las tres pasan a `rls_enabled_no_policy` (INFO), que es lo buscado (sólo
service_role). El ERROR que queda es `v_inscriptos_carrera` → ISSUE-098.

## 4. Paso 1 — la migración

`apply_migration portal_alta_spc_studbook` (texto de `BEGIN;` a `COMMIT;` del archivo) → `{"success":true}`. Verificación (MCP):

```json
[{"r":{"md5":{"fn_spcs_alta_revision":"cd33a7683698ccf0704683e678bdc623","rpc_spc_alta_studbook_portal":"704f4762eb9ce373aecd4be9abdd0a78"},"exec":{"authenticated":false,"anon":false,"service_role":true},"spcs":{"total":238,"secretaria":238,"pendientes":0,"alta_por":0},"trg":["trg_audit_spcs","trg_spcs_alta_revision","trg_spcs_updated_at"],"pol":"b277600da61ecda6e6b1e2250e508fa6","gr_sin_bak":"12db6e6b77de50c68496138c65a0dd35","migs":["20261002001531 cerrar_tablas_bak_publicas","20261002001639 portal_alta_spc_studbook"],"audit_spcs":0}}]
```

md5 = `tests/local/portal_alta_spc_md5_esperado.txt` (sandbox). Políticas sin cambios (`b277600d…`, igual al 01/10).
`gr_sin_bak` es la foto de grants de las demás tablas, nueva referencia (la del 01/10 incluía las 3 tablas bak).

## 5. Paso 2 — studbook-buscar v2

Deploy → `{"version":2,"verify_jwt":true,"ezbr_sha256":"c179f071b76538e6da97959ebf36b6080248ea66f92096093b735302ce526a16"}`
(contenido = `supabase/functions/studbook-buscar/index.ts` de la rama, md5 local `01d64c5818715fdeb6bc46a54e329102`).

### 5.1 Búsqueda de staff: igual que antes

Mismo script de un solo uso que el 01/10 (operador de prueba por magiclink, 7 términos, teardown). Comparación cuerpo a cuerpo
(sin `fuente`) contra la foto de la v1:

```
IGUAL BIEN COQUETA · 200
IGUAL MARIA CATU · 200
IGUAL bella doña · 200
IGUAL WAVE RIMOUT · 200
IGUAL EL MAS SABIO · 200
IGUAL ZZZZQ · 200
IGUAL ab · 400
todas iguales: True
```

Foto v1 (antes):

```json
{
  "email": "probe.sbfoto.operador.muq70z6d@sgh.test",
  "resultados": {
    "BIEN COQUETA": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "BIEN COQUETA",
        "exactos": [
          {
            "sb_id": "429819",
            "nombre": "BIEN COQUETA",
            "fecha_nacimiento": "2021-10-15",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Zaino Colorado",
            "padrillo_nombre": "Bien Terminado",
            "madre_nombre": "Gritty",
            "abuelo_materno": "Luhuk (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta",
            "leyenda": "(2021 H SP)",
            "tomo": 1241,
            "folio": 202,
            "raza": 4,
            "alertas": []
          },
          {
            "sb_id": "216248",
            "nombre": "BIEN COQUETA",
            "fecha_nacimiento": "1998-07-29",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Alazan",
            "padrillo_nombre": "Yale Twentyniner (USA)",
            "madre_nombre": "Coquetisima",
            "abuelo_materno": "Friul",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/216248/bien-coqueta",
            "leyenda": "(1998 H SP)",
            "tomo": 1057,
            "folio": 260,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "MARIA CATU": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "MARIA CATU",
        "exactos": [],
        "parciales": [
          {
            "sb_id": "440678",
            "nombre": "MARIA CATULENGA",
            "fecha_nacimiento": "2022-10-15",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Zaino",
            "padrillo_nombre": "Fiskardo",
            "madre_nombre": "Ever Propulsora",
            "abuelo_materno": "Ever Peace",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga",
            "leyenda": "(2022 H SP)",
            "tomo": 1251,
            "folio": 889,
            "raza": 4,
            "alertas": []
          }
        ]
      }
    },
    "bella doña": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "bella doña",
        "exactos": [
          {
            "sb_id": "403664",
            "nombre": "BELLA DOÑA",
            "fecha_nacimiento": "2017-11-13",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Alazan",
            "padrillo_nombre": "Bella Shambrock (USA)",
            "madre_nombre": "La Mejorcita",
            "abuelo_materno": "Missionary (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/403664/bella-dona",
            "leyenda": "(2017 M SP)",
            "tomo": 1215,
            "folio": 427,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "WAVE RIMOUT": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "WAVE RIMOUT",
        "exactos": [
          {
            "sb_id": "397805",
            "nombre": "WAVE RIMOUT",
            "fecha_nacimiento": "2017-08-08",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Zaino",
            "padrillo_nombre": "Remote (GB)",
            "madre_nombre": "Holiday Wave",
            "abuelo_materno": "Harlan's Holiday (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/397805/wave-rimout",
            "leyenda": "(2017 M SP)",
            "tomo": 1209,
            "folio": 804,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "EL MAS SABIO": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "EL MAS SABIO",
        "exactos": [
          {
            "sb_id": "431662",
            "nombre": "EL MAS SABIO",
            "fecha_nacimiento": "2021-10-26",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Alazan",
            "padrillo_nombre": "Il Campione (CHI)",
            "madre_nombre": "Indigirka",
            "abuelo_materno": "Interprete",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio",
            "leyenda": "(2021 M SP)",
            "tomo": 1242,
            "folio": 998,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "ZZZZQ": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "ZZZZQ",
        "exactos": [],
        "parciales": []
      }
    },
    "ab": {
      "status": 400,
      "body": {
        "ok": false,
        "error": "term_invalido",
        "detalle": "term: entre 3 y 60 caracteres, sin caracteres de control."
      }
    }
  },
  "teardown_usuarios_restantes": 0
}
```

Foto v2 (después):

```json
{
  "email": "probe.sbfoto.operador.muq7sh8w@sgh.test",
  "resultados": {
    "BIEN COQUETA": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "BIEN COQUETA",
        "exactos": [
          {
            "sb_id": "429819",
            "nombre": "BIEN COQUETA",
            "fecha_nacimiento": "2021-10-15",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Zaino Colorado",
            "padrillo_nombre": "Bien Terminado",
            "madre_nombre": "Gritty",
            "abuelo_materno": "Luhuk (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/429819/bien-coqueta",
            "leyenda": "(2021 H SP)",
            "tomo": 1241,
            "folio": 202,
            "raza": 4,
            "alertas": []
          },
          {
            "sb_id": "216248",
            "nombre": "BIEN COQUETA",
            "fecha_nacimiento": "1998-07-29",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Alazan",
            "padrillo_nombre": "Yale Twentyniner (USA)",
            "madre_nombre": "Coquetisima",
            "abuelo_materno": "Friul",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/216248/bien-coqueta",
            "leyenda": "(1998 H SP)",
            "tomo": 1057,
            "folio": 260,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "MARIA CATU": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "MARIA CATU",
        "exactos": [],
        "parciales": [
          {
            "sb_id": "440678",
            "nombre": "MARIA CATULENGA",
            "fecha_nacimiento": "2022-10-15",
            "sexo": "hembra",
            "sexo_sb": "Hembra",
            "color": "Zaino",
            "padrillo_nombre": "Fiskardo",
            "madre_nombre": "Ever Propulsora",
            "abuelo_materno": "Ever Peace",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/440678/maria-catulenga",
            "leyenda": "(2022 H SP)",
            "tomo": 1251,
            "folio": 889,
            "raza": 4,
            "alertas": []
          }
        ]
      }
    },
    "bella doña": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "bella doña",
        "exactos": [
          {
            "sb_id": "403664",
            "nombre": "BELLA DOÑA",
            "fecha_nacimiento": "2017-11-13",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Alazan",
            "padrillo_nombre": "Bella Shambrock (USA)",
            "madre_nombre": "La Mejorcita",
            "abuelo_materno": "Missionary (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/403664/bella-dona",
            "leyenda": "(2017 M SP)",
            "tomo": 1215,
            "folio": 427,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "WAVE RIMOUT": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "WAVE RIMOUT",
        "exactos": [
          {
            "sb_id": "397805",
            "nombre": "WAVE RIMOUT",
            "fecha_nacimiento": "2017-08-08",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Zaino",
            "padrillo_nombre": "Remote (GB)",
            "madre_nombre": "Holiday Wave",
            "abuelo_materno": "Harlan's Holiday (USA)",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/397805/wave-rimout",
            "leyenda": "(2017 M SP)",
            "tomo": 1209,
            "folio": 804,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "EL MAS SABIO": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "EL MAS SABIO",
        "exactos": [
          {
            "sb_id": "431662",
            "nombre": "EL MAS SABIO",
            "fecha_nacimiento": "2021-10-26",
            "sexo": "macho",
            "sexo_sb": "Macho",
            "color": "Alazan",
            "padrillo_nombre": "Il Campione (CHI)",
            "madre_nombre": "Indigirka",
            "abuelo_materno": "Interprete",
            "pais_origen": "Argentina",
            "url_perfil": "https://www.studbook.org.ar/ejemplares/perfil/431662/el-mas-sabio",
            "leyenda": "(2021 M SP)",
            "tomo": 1242,
            "folio": 998,
            "raza": 4,
            "alertas": []
          }
        ],
        "parciales": []
      }
    },
    "ZZZZQ": {
      "status": 200,
      "body": {
        "ok": true,
        "term": "ZZZZQ",
        "exactos": [],
        "parciales": []
      }
    },
    "ab": {
      "status": 400,
      "body": {
        "ok": false,
        "error": "term_invalido",
        "detalle": "term: entre 3 y 60 caracteres, sin caracteres de control."
      }
    }
  },
  "teardown_usuarios_restantes": 0
}
```

### 5.2 `node tests/probe_studbook_buscar_e2e.mjs`

El primer intento cortó en el arranque por un bug del probe (el caso 7d creaba un segundo usuario de portal con el mismo
email). Su `finally` limpió: 0 usuarios en `usuarios` y en auth, `spcs` 238. Corregido (email con sufijo `-ent`, commit
`ab10eef`). Segundo intento, completo:

```
✅ 1) operador · BIEN COQUETA → 200, ok, 2 exactos, fuente  → 200 [["BIEN COQUETA","2021-10-15","hembra"],["BIEN COQUETA","1998-07-29","hembra"]] · studbook.org.ar/ejemplares/autocomplete (scraping del buscador público, no API)
✅ 2) operador · MARIA CATU → 0 exactos, parcial MARIA CATULENGA  → 200 ["MARIA CATULENGA"]
✅ 3) operador · "ab" → 400 term_invalido  → 400 {"ok":false,"error":"term_invalido","detalle":"term: entre 3 y 60 caracteres, sin caracteres de control."}
✅ 4) profesional (portal) busca → 200, 2 exactos  → 200 ["429819","216248"]
✅ 7a operador traer → 403 solo_portal  → 403 {"ok":false,"error":"solo_portal","detalle":"Esta acción es para usuarios del portal."}
✅ 7b portal traer con sb_id que no es de ese nombre → 409 no_coincide  → 409 {"ok":false,"error":"no_coincide","detalle":"El Stud Book ya no devuelve ese caballo con ese nombre. Buscalo de nuevo."}
✅ 7c portal SIN entidad → 403 no_autorizado del G1 de la RPC (la función llegó a la RPC con la key)  → 403 {"ok":false,"error":"no_autorizado","detalle":"No autorizado: esta operación es para usuarios del portal."}
✅ 7d portal CON entidad, carrera de la 9999 (cancelada) → 422 V1  → 422 {"ok":false,"error":"rechazado","detalle":"La inscripción para ese turno no está abierta."}
✅ 7e count(*) FROM spcs sin cambios  → 238 → 238
✅ 5) sin token → 401  → 401
✅ 6) preflight desde sigh.com.ar → 2xx con ACAO  → 204 ACAO=https://sigh.com.ar
✅ T) teardown: 0 usuarios de prueba en `usuarios`  → []
✅ T) teardown: 0 usuarios de prueba en auth

13/13 asserts OK
exit 0
```

### 5.3 `node tests/probe_orden_inscriptos.mjs` (antes del merge, con la columna ya en prod)

```
✅ D1) pantalla: comparador con locale 'es'  — (a, b) =>
    (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es')
✅ D2) PDF: comparador con locale 'es'  — (a, b) => (a.spcs?.nombre || '').localeCompare(b.spcs?.nombre || '', 'es')
✅ D3) pantalla ya no ordena por created_at
✅ D4) ratificacion.html: todos sus sorts por nombre llevan 'es'  — total: 3, sin 'es': 0
✅ D5) inscripciones.html: ningún localeCompare sin 'es'
✅ C) pantalla: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — ANA < ANZUELO < AÑO NUEVO < AOTO
✅ C) PDF: Ñ después de toda la N (ANZUELO < AÑO NUEVO)  — ANA < ANZUELO < AÑO NUEVO < AOTO
✅ C) pantalla: Ñ entre N y O (NUBE < ÑANDU < OSO)  — NUBE < ÑANDU < OSO
✅ C) PDF: Ñ entre N y O (NUBE < ÑANDU < OSO)  — NUBE < ÑANDU < OSO
✅ C) pantalla: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB
✅ C) PDF: tilde no separa (MARIA ≈ MARÍA, antes que ...GB)  — MARIA CATULENGA < MARÍA CATULENGA < MARIA CATULENGB
✅ C) pantalla: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO
✅ C) PDF: caso real: CHINITA SALTEÑA entre SALTENA y SALTEO  — CHINITA SALTENA < CHINITA SALTEÑA < CHINITA SALTEO
✅ C) pantalla: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — LA CITY < La Porteña < LA PORTEÑO
✅ C) PDF: mayúsculas/minúsculas no separan (La Porteña / LA PORTEÑO)  — LA CITY < La Porteña < LA PORTEÑO
✅ A0) R9 tiene turnos  — 11 turnos
✅ A) T1: pantalla en alfabético 'es' (11)  — ARMOÑOZO | CONESERA | DESERT OF DUBAI | DOCTORA APASIONADA | ETERNA DOCTORA | First Queen | HERMANOSDEMIPATRIA | MOSQUITA GARDEN | QUE BELLA DOÑA | SI TIN | TIRSO
✅ A) T1: PDF == pantalla, id por id
✅ A) T1: todas las filas traen spcs.nombre por JOIN
✅ A) T2: pantalla en alfabético 'es' (8)  — ALHENA | ASTUTO NOTES | DEL CAMPEON | DOCTOR SKY | DOCTORA MIA | LOCA DUBAI | OLA DOCTOR | TOUCH OF BLUE
✅ A) T2: PDF == pantalla, id por id
✅ A) T2: todas las filas traen spcs.nombre por JOIN
✅ A) T3: pantalla en alfabético 'es' (13)  — ALHENA | ASTUTO NOTES | BAHIA ROMANA | DAHUA | DEL CAMPEON | DOCTOR SKY | DOCTORA MIA | LOCA DUBAI | MARIA CATULENGA | OLA DOCTOR | TORO MAÑERO | TOUCH OF BLUE | VISION SECURITY
✅ A) T3: PDF == pantalla, id por id
✅ A) T3: todas las filas traen spcs.nombre por JOIN
✅ A) T4: pantalla en alfabético 'es' (13)  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NIÑO OCEANICO | NISTEL WIN | REY DE PILA | SOUTH GOTICO | TOY BOY
✅ A) T4: PDF == pantalla, id por id
✅ A) T4: todas las filas traen spcs.nombre por JOIN
✅ A) T5: pantalla en alfabético 'es' (7)  — AMIGUITO JESUS | CHE CARABANERA | KUCCINI | LEONADA CHAT | NELIDA RIM | NOCHE EN VELA | OJO EXCELENTE
✅ A) T5: PDF == pantalla, id por id
✅ A) T5: todas las filas traen spcs.nombre por JOIN
✅ A) T6: pantalla en alfabético 'es' (7)  — EL MAS SABIO | FALAYS | FREE CRY | GRAN RAUL | HALLOTOP | IDALIA MARO | REINA EDITION
✅ A) T6: PDF == pantalla, id por id
✅ A) T6: todas las filas traen spcs.nombre por JOIN
✅ A) T7: pantalla en alfabético 'es' (8)  — ATOMIZADOR | ECHO IN THE SKY | EL RISKO | LATIN PRESUMIDA | LE BATEAU | SEMBRADOR CHUCK | SEÑOR MONCHI | YOOKY
✅ A) T7: PDF == pantalla, id por id
✅ A) T7: todas las filas traen spcs.nombre por JOIN
✅ A) T8: pantalla en alfabético 'es' (4)  — IDALIA MARO | LATIN PRESUMIDA | REINA EDITION | YOOKY
✅ A) T8: PDF == pantalla, id por id
✅ A) T8: todas las filas traen spcs.nombre por JOIN
✅ A) T9: pantalla en alfabético 'es' (8)  — ARTHURUS | CANDIDATA PIRANERA | CHINITA SALTEÑA | ESPLENDID CRAF | LE BATEAU | QUERELLANTE | THE BEAST PARTY | WISLA KEN
✅ A) T9: PDF == pantalla, id por id
✅ A) T9: todas las filas traen spcs.nombre por JOIN
✅ A) T10: pantalla en alfabético 'es' (9)  — ABARAJALA | BABY PARADISE | GRILLADA RYE | INDIANA MARO | KRISTALINA | LATIN RAIN | LOGUACIOUS | MARUKA PLUS | QUINIELA TREND
✅ A) T10: PDF == pantalla, id por id
✅ A) T10: todas las filas traen spcs.nombre por JOIN
✅ A) T11: pantalla en alfabético 'es' (14)  — ABARAJALA | BABY PARADISE | BUEN MANUEL | DESTINADO JOHAN | EL GRAN HECTOR | ES SABALERO | GOIADORA | HEART OF GOLD | INDIO VALIDO | KRISTALINA | LATIN RAIN | MARUKA PLUS | QUINIELA TREND | TERRIBLE KING
✅ A) T11: PDF == pantalla, id por id
✅ A) T11: todas las filas traen spcs.nombre por JOIN
✅ B1) T4 contiene NIÑO OCEANICO y NISTEL WIN  — 8/9
✅ B2) T4: NIÑO OCEANICO antes que NISTEL WIN  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NIÑO OCEANICO | NISTEL WIN | REY DE PILA | SOUTH GOTICO | TOY BOY
✅ B3) discriminante: por codepoint saldrían al revés (NISTEL < NIÑO)  — BACON | BIEN COQUETA | COLONIAL JOHAN | GRILLADA RYE | KRISTALINA | LIVIA DRUSA | LOGUACIOUS | MARUKA PLUS | NISTEL WIN | NIÑO OCEANICO | REY DE PILA | SOUTH GOTICO | TOY BOY

52/52 asserts OK
exit 0
```

## 6. Paso 3 — merge y Pages

`gh pr merge 29 --merge` → `MERGED c868ecc9334d8df4773c5895addf6e7ff162c194`. Polling cada 15 s comparando md5 de
`git show c868ecc:<archivo>` contra `curl https://sigh.com.ar/<archivo>?v=$RANDOM`:

```
intento 4 00:21:08
portal.html local=e2bb503734398cbc7f91796d9bb30d07 prod=e2bb503734398cbc7f91796d9bb30d07 OK
spcs.html local=5961eefe41ea6ac25d4d693f3109b8d3 prod=5961eefe41ea6ac25d4d693f3109b8d3 OK
inscripciones.html local=367058c01f5dfcfc3eeb458380ad7d99 prod=367058c01f5dfcfc3eeb458380ad7d99 OK
auditoria.html local=3ebb1dbd124631c0ac849a5890a4a52f prod=3ebb1dbd124631c0ac849a5890a4a52f OK
```

## 7. Paso 3 — prueba en prod con fixture: `node tests/probe_portal_alta_spc_prod.mjs`

`portal.html` servido por `sigh.com.ar` en jsdom, con sesión real de un usuario de portal de prueba. Fixture: reunión 9984
(2099-08-10, publicada), carrera T1 abierta, entrenador y caballeriza `PROBE-ALTA-*`. **Nada en R10.** Normal: BIEN COQUETA
(del padrón). Nueva: TROMPETERO (SB 128894, 1987, único en el Stud Book y fuera del padrón). Su ficha es fixture y el
teardown la borra. `edad > 12 (112 años)` sale porque la reunión fixture es de 2099.

```
✅ H) el portal.html servido tiene el flujo nuevo (traerYAnotar / botonStudBookPortal)  → https://sigh.com.ar/portal.html
✅ N1) BIEN COQUETA aparece en el buscador del padrón con "Anotar"  → BIEN COQUETA
        
          hembra
          5 años · 15/10/2021
          SB 429819
          Bien Terminado × Gritty
          
          
        
      
      Anotar
    ¿No es ninguno de esto
✅ N2) inscripción normal en prod: canal portal, inscripto_por = usuario, caballeriza/entrenador declarados  → {"id":"bd3cc11a-ef33-45d7-967b-4293e094cb4c","canal":"portal","inscripto_por":"79f96896-3a20-4139-b1d1-7042dd3b7b63","estado":"inscripto","caballeriza_id":"4c0ff096-bc48-4e84-849b-041975b27dd7","entrenador_id":"12d41700-9d53-47ac-9f48-be54e8bc9ec4"}
✅ N3) la ficha del padrón no se tocó (secretaria, sin revisión)  → {"alta_origen":"secretaria","revision_pendiente":false}
✅ T1) TROMPETERO no está en el padrón → botón "Buscar «TROMPETERO» en el Stud Book"  → Ningún caballo del padrón coincide con esa búsqueda.
           Si el ejemplar existe, buscalo en el Stud Book y anotalo desde acá:
           🔎 Buscar «TROMPETERO» en el Stud Book
           Si tamp
✅ T2) la función real devuelve el candidato (SB 128894) con "Es este — anotarlo"  → Stud Book — elegí el caballo
        
          TROMPETERO
          
            macho
            39 años · 01/12/1987
            Alazan
            El Troyano × Excentric
            SB 128894
          
        
        Es este — anotarlo
      
        Al anotarlo, el caballo queda cargado con
✅ T3) ficha nueva: TROMPETERO, portal, alta_por = usuario, pendiente, activo, club/entrenador NULL  → {"id":"efb3aef9-50d4-48ce-bc7d-c38753316a96","nombre":"TROMPETERO","studbook_id":"128894","alta_origen":"portal","alta_por":"79f96896-3a20-4139-b1d1-7042dd3b7b63","revision_pendiente":true,"revision_motivos":["edad > 12 (112 años según el Stud Book)"],"estado":"activo","club_id":null,"entrenador_id":null,"notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA muq7xur8 01/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"}
✅ T4) motivo "edad > 12" en revision_motivos (no en notas) y notas con "alta desde el portal por Probe ALTA"  → [["edad > 12 (112 años según el Stud Book)"],"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA muq7xur8 01/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)"]
✅ T5) inscripción de la nueva de corrido: canal portal, inscripto_por = usuario  → {"id":"148f601b-6bb7-41f6-a0f0-48b863e761c6","canal":"portal","inscripto_por":"79f96896-3a20-4139-b1d1-7042dd3b7b63","estado":"inscripto","caballeriza_id":"4c0ff096-bc48-4e84-849b-041975b27dd7","entrenador_id":"12d41700-9d53-47ac-9f48-be54e8bc9ec4"}
✅ T6) spcs +1 exacto durante la prueba
✅ T7) auditoría del INSERT en spcs con alta_por  → [{"accion":"INSERT","datos_despues":{"id":"efb3aef9-50d4-48ce-bc7d-c38753316a96","sexo":"macho","color":"Alazan","notas":"SB 128894 · https://www.studbook.org.ar/ejemplares/perfil/128894/trompetero · alta desde el portal por Probe ALTA muq7xur8 01/10/2026 · abuelo materno: Exalte (FR) · (1987 M SP)","estado":"activo","marcas":null,"nombre":"TROMPETERO","club_id":null,"doc_url":null,"alta_por":"79f96896-3a20-4139-b1d1-7042dd3b7b63","foto_url":null,"created_at":"2026-10-02T00:22:27.306668+00:00","updated_at":"2026-10-02T00:22:27.306668+00:00","alta_origen":"portal","pais_origen":"Argentina","revisado_at":null,"studbook_id":"128894","madre_nombre":"Excentric","revisado_por":null,"entrenador_id":null,"abuela_materna":null,"caballeriza_id":null,"padrillo_nombre":"El Troyano","fecha_nacimiento":"1987-12-01","revision_motivos":["edad > 12 (112 años según el Stud Book)"],"ult_performances":null,"certificado_correr":false,"jockey_habitual_id":null,"registro_stud_book":null,"revision_pendiente":true}}]
✅ E) sin errores de JS en la página
✅ R1) restore: 0 filas del run (reunión, inscripciones, TROMPETERO, usuario, auth, profesional, caballeriza, auditoría)  → {"reuniones_9984":0,"inscripciones":0,"trompetero":0,"usuarios":0,"profesionales":0,"caballerizas":0,"auditoria_del_run":0,"auth":0}
✅ R2) spcs antes = después (ninguna alta real)  → 238 → 238

14/14 asserts OK
exit 0
```

### 7.1 Foto final (MCP)

```json
[{"r":{"ahora":"2026-10-02T00:22:46.743794+00:00","spcs":{"total":238,"portal":0,"pendientes":0},"sb_128894":0,"reuniones_prueba":null,"usuarios_probe":0,"md5":{"fn_spcs_alta_revision":"cd33a7683698ccf0704683e678bdc623","rpc_spc_alta_studbook_portal":"704f4762eb9ce373aecd4be9abdd0a78"},"migs":["20261002001531 cerrar_tablas_bak_publicas","20261002001639 portal_alta_spc_studbook"],"insc_reales_ultima_hora":0}}]
```

## 8. Para saber

- **Desde ahora `spcs` está auditada.** Los probes que crean y borran SPC de fixture con la key secreta
  (`probe_modificar_inscripcion_portal`, `probe_caballeriza_provisorio`, `probe_spcs_studbook_alta`) van a dejar en
  `auditoria` el INSERT/DELETE de esas fichas, con `usuario_id` NULL. No bloquea nada: no hay FK a `usuarios`. Pero si un probe
  inserta una ficha con la **sesión de un usuario** y después borra al usuario, tiene que borrar antes la auditoría de ese
  usuario, como ya hace `probe_sanciones_alta`. Y como `spcs.alta_por` es FK a `usuarios`, la ficha va antes que el usuario.
- La alta del portal queda en `auditoria` con `club_id` y `usuario_id` NULL (entra por service_role). La ve super_admin; para
  el staff, quién la dio de alta está en la ficha (`alta_por`, caja de revisión en `spcs.html`).
- `probe_aviso_jockey_repetido`: su tramo de `saveMontas` sigue roto desde ISSUE-084 (el stub no tiene `rpc`). No es de esto.
- La secret de la función: resolvió una key no legacy (7c y el paso 3 llegaron a la RPC). El nombre de la env no se loguea
  en una respuesta OK, así que no está medido cuál de las candidatas fue (`STUDBOOK_DB_KEY` | `INVITE_DB_KEY` | …).
- Pendientes anotados (PR #30): ISSUE-098 `v_inscriptos_carrera`, ISSUE-099 las 26 SECURITY DEFINER de anon (con diagnóstico
  de quién las llama antes de revocar), ISSUE-100 Wave Rimout. Y el aviso al ratificar, que lo ves con Yesi.

---

## Verificación de push

```
$ git push -q origin HEAD:reports
$ git ls-remote origin reports
d5ece471ede99479b3ae5099bee22e180e4fbf1a	refs/heads/reports
$ git rev-parse HEAD
d5ece471ede99479b3ae5099bee22e180e4fbf1a
```

Coinciden (commit `d5ece47`). Este bloque va en un commit posterior.
