#!/usr/bin/env bash
# tests/correr_todos.sh — corre todos los probes que NO escriben en prod y NO necesitan el sandbox,
# y da un resumen verde/rojo por probe. Regla (CLAUDE.md § Probes de regresión): se corre antes de
# cada merge a main y el resumen va en el informe. Los rojos preexistentes están en
# tests/correr_todos.rojos_conocidos (no bloquean); un rojo que NO está ahí es NUEVO y bloquea el merge.
#
#   tests/correr_todos.sh                 # todos los de la lista
#   tests/correr_todos.sh orden pagos     # sólo los que contienen alguno de esos textos
#   SALIDA=<dir> tests/correr_todos.sh    # dónde dejar la salida completa de cada probe (default: mktemp)
#   TIEMPO=<seg> tests/correr_todos.sh    # tope por probe (default 300)
#   REPO=<checkout> <ruta>/correr_todos.sh # correr sobre otro checkout (p. ej. el principal, con tmp/)
#
# Sale con 0 si no hay rojos nuevos, 1 si hay alguno, 2 si falta la secret key.
#
# Qué entra: sólo lectura contra prod, base en memoria, jsdom con stubs, Chromium headless. Se eligió
# leyendo cada probe (no por grep del encabezado: hay probes que dicen "solo lectura" y crean fixtures).
# Qué NO entra (no se corren solos, a demanda y con su protocolo):
#   - ESCRIBEN en prod (fixtures en la 9999 o reuniones propias, usuarios, recibos): carta_hora_local,
#     caballeriza_provisorio, modificar_inscripcion_portal,
#     xss_portal_nombres, pagos_rol_carrera, montas_post_oficial, guard_staff_rpcs, smoke_*, y el resto
#     de los que llaman insert/update/delete/createUser/generateLink sobre el cliente real;
#   - SÓLO SANDBOX (tests/local/): portal_alta_spc_studbook, resultados_cerrada, usuarios_pantalla,
#     paridad_llamado_inscripciones (fixture en el sandbox desde el 02/10), …;
# bolsa_efectiva SÍ está: escribe sólo en el sandbox (fixture) y lee prod; sin sandbox saltea esa parte con ⏸.
#   - MANDAN MAILS: solicitar_cuenta_existente, autoregistro_e2e, invite_user, …;
#   - NECESITAN LOGIN REAL (SGH_EMAIL / SGH_PASSWORD de un usuario de prod): alineado_browser, badge_overlap_browser;
#   - scripts que no son probes (render_*, recalculo_r9_subroles, diag_*, dryrun_*).
set -u
# REPO: el checkout donde correr (default: el de este script). Hay probes que leen tmp/ (gitignored),
# que sólo existe en el checkout principal: correrlo ahí, no en un worktree.
cd "${REPO:-$(dirname "$0")/..}" || exit 2
[ -f .env ] && { set -a; . ./.env; set +a; }
if [ -z "${SUPABASE_SECRET_KEY:-}" ]; then echo "Falta SUPABASE_SECRET_KEY (.env)"; exit 2; fi

# probe | argumentos (sin --mutantes: acá sólo la corrida base)
LISTA='
probe_activacion_pendiente|
probe_alineado_programa|
probe_apuestas_especiales|
probe_aviso_jockey_repetido|
probe_badge_overlap|
probe_bolsa_efectiva|
probe_carta_numero_turno|
probe_carta_selector_reunion|
probe_chapa_4medio|
probe_cobros_caballeriza|
probe_condicion_sexo_r9|
probe_cuerpos_oficial|
probe_edad_display|
probe_edad_reglamentaria|
probe_fmtinput_onblur|
probe_forfait_anulada|
probe_ganadas_carta_llamados|
probe_inscripcion_editar_carrera|
probe_inscripciones_alta_studbook|
probe_inscripciones_listado|
probe_mandil_colores|
probe_montas_reales|
probe_motor_chequeo_errores|
probe_orden_carreras|
probe_orden_inscriptos|
probe_orden_ui|
probe_pagos_carrera_busqueda|
probe_pagos_vista_carrera|
probe_pagos_vista_incentivo_pagados|
probe_portal_alta_spc_ui|
probe_portal_carta|
probe_portal_validacion|
probe_programa_null_estado|
probe_programa_r8_imprenta|
probe_recibo_rol|
probe_recibo_una_hoja|
probe_regex_datos_personales|
probe_resultados_front_cerrada|
probe_reparto_100|SOLO=S,U,P
probe_rls_no_permissive|
probe_spcs_r9_tanda_1|
probe_studbook_buscar_fn|
probe_studbook_v2|
probe_tapa_flyer|
probe_v_inscriptos_cerrada|
'
CONOCIDOS="${CONOCIDOS:-tests/correr_todos.rojos_conocidos}"   # se puede apuntar a otra lista (ruta absoluta)
SALIDA="${SALIDA:-$(mktemp -d)}"; mkdir -p "$SALIDA"
TIEMPO="${TIEMPO:-300}"
FILTRO=("$@")

verdes=(); conocidos=(); nuevos=(); ausentes=(); arreglados=()
while IFS='|' read -r probe env_extra; do
  [ -z "$probe" ] && continue
  if [ ${#FILTRO[@]} -gt 0 ]; then
    hit=0; for f in "${FILTRO[@]}"; do [[ "$probe" == *"$f"* ]] && hit=1; done
    [ $hit = 0 ] && continue
  fi
  archivo="tests/$probe.mjs"
  if [ ! -f "$archivo" ]; then ausentes+=("$probe"); printf '%-42s %s\n' "$probe" "— no está en esta rama"; continue; fi
  ini=$(date +%s)
  if [ -n "$env_extra" ]; then env $env_extra timeout "$TIEMPO" node "$archivo" > "$SALIDA/$probe.txt" 2>&1
  else timeout "$TIEMPO" node "$archivo" > "$SALIDA/$probe.txt" 2>&1; fi
  rc=$?; seg=$(( $(date +%s) - ini ))
  conocido=$(grep -E "^$probe([[:space:]]|$)" "$CONOCIDOS" 2>/dev/null | head -1)
  if [ $rc -eq 0 ]; then
    verdes+=("$probe"); estado="🟢 verde"
    [ -n "$conocido" ] && { arreglados+=("$probe"); estado="🟢 verde (estaba en rojos conocidos: sacarlo de la lista)"; }
  elif [ -n "$conocido" ]; then
    conocidos+=("$probe"); estado="🟠 rojo CONOCIDO (rc=$rc)"
  else
    nuevos+=("$probe"); estado="🔴 ROJO NUEVO (rc=$rc$([ $rc -eq 124 ] && echo ', timeout'))"
  fi
  printf '%-42s %-60s %4ss\n' "$probe" "$estado" "$seg"
done <<< "$LISTA"

echo
echo "Resumen: ${#verdes[@]} verdes · ${#conocidos[@]} rojos conocidos · ${#nuevos[@]} rojos NUEVOS · ${#ausentes[@]} ausentes"
[ ${#conocidos[@]} -gt 0 ] && { echo "Rojos conocidos (no bloquean):"; for p in "${conocidos[@]}"; do echo "  - $(grep -E "^$p([[:space:]]|$)" "$CONOCIDOS" | head -1)"; done; }
[ ${#arreglados[@]} -gt 0 ] && { echo "Conocidos que ahora pasan (sacarlos de $CONOCIDOS):"; printf '  - %s\n' "${arreglados[@]}"; }
[ ${#nuevos[@]} -gt 0 ] && { echo "ROJOS NUEVOS (bloquean el merge):"; printf '  - %s\n' "${nuevos[@]}"; }
echo "Salida completa de cada probe: $SALIDA/<probe>.txt"
[ ${#nuevos[@]} -eq 0 ]
