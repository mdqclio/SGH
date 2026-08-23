// ============================================================
// reunion-json — DEPLOY BUILD (archivo único, shared inlineado)
// ============================================================
// GENERADO. No editar a mano: se regenera con
//   node supabase/functions/reunion-json/_build/build.mjs
// Fuente: los 4 archivos listados abajo, inlineados en orden de
// dependencias. El runtime no resuelve imports relativos.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------- inline: _shared/chapas_map.mjs ----------
// ============================================================
// Chapas (cuerpos) — resolución de texto → id del catálogo
// ============================================================
// El catálogo canónico es CHAPAS_CATALOG en chapas.js (raíz del repo), spec
// validada por Fede el 25/05/2026, cableado al dropdown de resultados.html.
// Acá se replica SOLO el par codigo→id, sin los SVG, porque chapas.js es un
// script de browser sin `export` (lo cargan resultados.html y
// ratificacion.html como global) y convertirlo a módulo rompería esas dos
// páginas de producción.
//
// La duplicación está cubierta por tests/probe_studbook_v2.mjs, que carga
// chapas.js y verifica que los 19 códigos y sus ids coinciden exactamente.
//
// ⚠️ Los ids NO son contiguos ni siguen el orden de distancia: están
// persistidos por código en resultado_posiciones.diferencia, así que nunca se
// renumeran. El id 20 ("4½ cpos") se dio de alta después y va, por distancia,
// entre el 16 y el 17.
// ============================================================

// Los 19 códigos fijos del catálogo. El id 17 ("varios") no está acá: no
// tiene código fijo, se arma dinámico como "N cpos" con N ≥ 5.
const CHAPAS_CODIGO_A_ID = {
  'emp':     1,   // Empate
  'vm':      2,   // Ventaja mínima
  'hoc':     3,   // Hocico
  '½ cbz':   4,   // Media cabeza
  'cza':     5,   // Cabeza
  '½ pzo':   6,   // Medio pescuezo
  'pzo':     7,   // Pescuezo
  '½ cpo':   8,   // ½ cuerpo
  '¾ cpo':   9,   // ¾ cuerpo
  '1 cpo':  10,   // 1 cuerpo
  '1½ cpo': 11,   // 1 cuerpo y ½
  '2 cpos': 12,   // 2 cuerpos
  '2½ cpos':13,   // 2½ cuerpos
  '3 cpos': 14,   // 3 cuerpos
  '3½ cpos':15,   // 3½ cuerpos
  '4 cpos': 16,   // 4 cuerpos
  '4½ cpos':20,   // 4½ cuerpos — alta posterior, por eso el id fuera de orden
  's.a.':   18,   // Sin apreciación (tipo estado, no distancia)
  'desm.':  19,   // Desmontó        (tipo estado, no distancia)
};

const CHAPA_ID_VARIOS = 17;

// ------------------------------------------------------------
// Variantes legacy: texto libre cargado a mano ANTES de que el dropdown de
// resultados.html estuviera cableado al catálogo. Mapa EXPLÍCITO, revisado
// uno por uno — nada de fuzzy matching ni normalización automática, porque
// un match aproximado equivocado cambia el margen de llegada de una carrera
// oficial.
//
// Son 10 de los 11 valores fuera de catálogo que hay hoy en la base.
// El 11º es "nariz" y NO se mapea a propósito: no existe en el catálogo. Lo
// más cercano sería 'hoc' (Hocico), pero eso es una decisión de dominio, no
// nuestra. Sale con id_interno null y el texto intacto, y queda listado en
// docs/JSON_V2_CIERRE.md como pregunta para Yesi/Fede.
// ------------------------------------------------------------
const VARIANTES_LEGACY = {
  '1 cuerpo':      '1 cpo',
  '2 cuerpos':     '2 cpos',
  '3 cuerpos':     '3 cpos',
  '5 cuerpos':     '5 cpos',   // → varios (id 17, n=5)
  'cabeza':        'cza',
  'media cabeza':  '½ cbz',
  'pescuezo':      'pzo',
  '3/4 cuerpo':    '¾ cpo',
  '1 1/2 cuerpos': '1½ cpo',
  '2 1/2 cuerpos': '2½ cpos',
};

const RX_VARIOS = /^(\d+) cpos$/;

/**
 * Resuelve el texto de resultado_posiciones.diferencia contra el catálogo.
 *
 * Orden de resolución:
 *   1. código exacto del catálogo
 *   2. "N cpos" con N ≥ 5 → varios (id 17) + n
 *   3. variante legacy conocida → se reintenta con el código canónico
 *   4. nada → id null (el texto viaja igual, sin reescribir)
 *
 * @param {string|null} txt
 * @returns {{id: number|null, codigo: string|null, n: number|null}}
 */
function resolverChapa(txt) {
  const vacio = { id: null, codigo: null, n: null };
  if (txt == null) return vacio;
  const s = String(txt).trim();
  if (!s) return vacio;

  const directo = CHAPAS_CODIGO_A_ID[s];
  if (directo != null) return { id: directo, codigo: s, n: null };

  const mv = RX_VARIOS.exec(s);
  if (mv) {
    const n = parseInt(mv[1], 10);
    // 1..4 cuerpos tienen código propio (ids 10/12/14/16) y ya cayeron en el
    // lookup directo. "varios" arranca en 5.
    if (n >= 5) return { id: CHAPA_ID_VARIOS, codigo: s, n };
    return vacio;
  }

  const canon = VARIANTES_LEGACY[s];
  if (canon != null) {
    const porCanon = CHAPAS_CODIGO_A_ID[canon];
    if (porCanon != null) return { id: porCanon, codigo: canon, n: null };
    const mc = RX_VARIOS.exec(canon);
    if (mc) {
      const n = parseInt(mc[1], 10);
      if (n >= 5) return { id: CHAPA_ID_VARIOS, codigo: canon, n };
    }
  }

  return vacio;
}

// ---------- inline: _shared/mandil.mjs ----------
// ============================================================
// Mandil (= chapa) — renumeración canónica 1..N
// ============================================================
// Port EXACTO de renumerar-chapas.js (raíz del repo), que es el fuente de
// verdad usado por el frontend. No se puede importar el original desde acá:
// es un script de browser sin `export`, cargado como global por
// resultados.html y ratificacion.html — agregarle `export` obligaría a
// convertir esos <script> a type="module" y rompería dos páginas de
// producción.
//
// La duplicación está cubierta por tests/probe_studbook_v2.mjs, que carga
// renumerar-chapas.js y compara la salida de ambas implementaciones sobre
// fixtures. Si alguien toca una y no la otra, el probe falla.
//
// Modelo (ver docs/MODELO_NUMERACION.md y CLAUDE.md):
//   - GATERA  = inscripciones.numero_partidor. Cajón de largada por sorteo.
//               Puede tener huecos. Nunca se muestra al usuario.
//   - MANDIL  = número visible en el dorsal. Siempre 1..N consecutivo.
//               Se DERIVA de la gatera. No se persiste en ninguna tabla.
// ============================================================

/**
 * Renumeración canónica de chapas 1..N.
 *
 * Solo inscripciones en estado 'ratificado' cuentan (filtro POSITIVO, no lista
 * de exclusión: forfait y mal_inscrito quedan afuera solos).
 * Se ordenan ASC por numero_partidor (nulls al final) y se les asigna
 * mandil 1, 2, … N en ese orden.
 *
 * @param {Array} inscripciones  TODAS las inscripciones de la carrera, sin
 *                               filtrar, con { id, estado, numero_partidor }.
 * @returns {Object}  Mapa { inscripcion_id (string): mandil (number) }.
 */
function renumerarChapas(inscripciones) {
  const ratificadas = (inscripciones || [])
    .filter(i => i.estado === 'ratificado')
    .sort((a, b) => (a.numero_partidor || 9999) - (b.numero_partidor || 9999));
  const map = {};
  ratificadas.forEach((i, idx) => { map[i.id] = idx + 1; });
  return map;
}

// ---------- inline: _shared/studbook_format.mjs ----------
// ============================================================
// Stud Book — Lógica de FORMATO compartida (pura, sin I/O)
// ============================================================
// Fuente única de verdad del armado del JSON de reunión.
// La importan TANTO el generador CLI (tools/studbook_reunion_json.mjs, Node)
// COMO la Edge Function (supabase/functions/reunion-json, Deno).
// Así el output es idéntico byte a byte y no diverge.
//
// 100% puro: recibe datos ya cargados (rows + Maps) y devuelve el objeto.
// NO hace fetch, NO toca env, NO escribe archivos.
// ============================================================


const TZ_DEFAULT = 'America/Argentina/Buenos_Aires';

// max(bolsa*pct/100, ganancia_minima) — réplica de premios-utils.js#calcPremiosConPiso
function importePuesto(bolsa, pct, minimo) {
  const calc = (parseFloat(bolsa) || 0) * (parseFloat(pct) || 0) / 100;
  const min = parseFloat(minimo) || 0;
  return (min > 0 && calc < min) ? min : calc;
}

// Techo de plausibilidad de un tiempo de carrera, en segundos. Ninguna carrera
// de turf dura 10 minutos: la mas larga del calendario argentino (3000 m) se
// corre en ~3'10". Un valor por encima de esto no es un tiempo lento, es un
// tiempo mal cargado — y el modo de falla conocido es que el operador tipee
// "43:13" queriendo decir 43 segundos 13 centesimas y la mascara MM:SS.CC de
// resultados.html lo acepte como 43 minutos. Ver TIEMPO_R8 en el reporte.
const TIEMPO_MAX_SEGUNDOS = 600;

// Parte un tiempo_ganador (varchar libre) en {minutos, segundos, centesimas, decimas}.
// Formatos tolerados: "M:SS.cc", "M:SS", "SS.cc", "SS", numerico de segundos.
// Si no se puede parsear (o es null), devuelve los campos en null.
//
// Dos digitos despues del punto son CENTESIMAS, no decimas: es la notacion que
// usa el tote y la que usa Diego ("47.13c"). El campo historico `decimas` sale
// con ese mismo numero — se mantiene tal cual para no romper al consumidor, que
// hoy lo lee como centesimas — y se agrega `centesimas` con el nombre correcto.
// Contrato ADITIVO, igual que numero_publico: se suma el campo bueno, no se saca
// el viejo. Cuando Diego confirme que migro, `decimas` se puede retirar.
//
// Un tiempo por encima de TIEMPO_MAX_SEGUNDOS sale en null en los cuatro campos.
// Emitir 43 minutos para una carrera de 800 m seria mandar un numero falso con
// cara de dato bueno; null dice "no tengo el tiempo", que es la verdad hasta que
// alguien lo corrija contra el ticket del tote.
function parseTiempo(raw) {
  const empty = { minutos: null, segundos: null, centesimas: null, decimas: null };
  if (raw == null) return empty;
  const s = String(raw).trim();
  if (!s) return empty;
  let minutos = 0, resto = s;
  if (s.includes(':')) {
    const [m, r] = s.split(':');
    minutos = parseInt(m, 10) || 0;
    resto = r;
  }
  let segundos = 0, centesimas = 0;
  if (resto.includes('.')) {
    const [seg, cen] = resto.split('.');
    segundos = parseInt(seg, 10) || 0;
    // "1:15.5" son 5 decimas = 50 centesimas, no 5 centesimas.
    const cenTxt = String(cen).replace(/\D/g, '');
    centesimas = cenTxt.length === 1 ? (parseInt(cenTxt, 10) || 0) * 10 : (parseInt(cenTxt, 10) || 0);
  } else {
    segundos = parseInt(resto, 10) || 0;
  }
  if (Number.isNaN(minutos) && Number.isNaN(segundos)) return empty;
  if (minutos * 60 + segundos > TIEMPO_MAX_SEGUNDOS) return empty;
  return { minutos, segundos, centesimas, decimas: centesimas };
}

// 'ambos' → 'T'; otros valores se pasan tal cual (gap de mapeo definitivo).
function mapSexo(s) {
  if (s == null) return null;
  return s === 'ambos' ? 'T' : s;
}

// Procedencia de la caballeriza: hipodromo_patente si existe; si no, el sufijo
// entre paréntesis del nombre (ej. "Stud X (SL)" → "SL"); si no hay, null.
function procedenciaCaballeriza(cab) {
  if (!cab) return null;
  if (cab.hipodromo_patente) return cab.hipodromo_patente;
  const m = /\(([^)]+)\)\s*$/.exec(cab.nombre || '');
  return m ? m[1].trim() : null;
}

// Nombre de la caballeriza SIN el sufijo de procedencia pegado:
// "LA BETTY (TDL)" → "LA BETTY". El sufijo entre paréntesis es la MISMA
// información que ya viaja en `procedencia`, duplicada dentro del texto;
// Diego consume el nombre puro en `nombre` y la procedencia en su campo.
//
// Se saca exactamente el paréntesis final que lee procedenciaCaballeriza —
// ningún otro paréntesis del nombre se toca. Si al sacarlo no queda nada,
// se devuelve el nombre original: no emitimos un nombre vacío.
//
// Dos nombres puros pueden colisionar entre sí ("SANTA BARBARA" y
// "SANTA BARBARA (DOL)" son dos caballerizas distintas en la DB). Se
// desambiguan por `caballeriza.id`, que ya viaja en el mismo objeto.
function nombreCaballerizaLimpio(cab) {
  if (!cab || !cab.nombre) return cab?.nombre ?? null;
  const limpio = String(cab.nombre).replace(/\s*\([^)]+\)\s*$/, '').trim();
  return limpio || cab.nombre;
}

function nombreCompleto(p) {
  if (!p) return null;
  return [p.nombre, p.apellido].filter(Boolean).join(' ') || null;
}

// Calco de formato Stud Book: numéricos van como string. null pasa tal cual.
function str(v) {
  return v == null ? null : String(v);
}
// Idem pero con 2 decimales fijos (ej. kilos jockey "57.00").
function str2(v) {
  return v == null ? null : (parseFloat(v)).toFixed(2);
}

// ============================================================
// Armado del JSON completo. Recibe los datos ya cargados:
//  - reunion: row de reuniones (id, fecha, ...)
//  - hipodromo: row de hipodromos o null
//  - carreras: array de carreras ordenado por numero_turno
//  - resByCarrera:  Map carrera_id   → row resultado
//  - inscByCarrera: Map carrera_id   → array de inscripciones
//  - posByInsc:     Map inscripcion_id → row resultado_posiciones
//  - catMap/profMap/cabMap/spcMap: Map id → row de lookup
//  - tz: timezone string
// ============================================================
function buildReunionJson({
  reunion, hipodromo, carreras,
  resByCarrera, inscByCarrera, posByInsc,
  catMap, profMap, cabMap, spcMap,
  tz = TZ_DEFAULT,
}) {
  // ------------------------------------------------------------
  // Qué carreras VIAJAN. Conjunto fijo, tres condiciones y nada más:
  //   1. la CATEGORÍA de la carrera es oficial   (categorias_carrera.es_oficial)
  //   2. la CATEGORÍA de la carrera es computable (categorias_carrera.es_computable)
  //   3. la carrera no está anulada
  //
  // El estado del RESULTADO no filtra carreras — sólo decide si se adjunta
  // el resultado (ver `res` más abajo). Una carrera con resultado provisional
  // viaja igual, como programa.
  //
  // es_computable se agregó el 2026-08-23 (punto 1 del diagnóstico de Diego).
  // Antes viajaban todas las oficiales, computables o no. Fede confirmó que las
  // No Computables no van y que el dato está cargado por ellos y coincide con
  // el programa impreso. En Dolores el recorte es grande: la ONC es la categoría
  // mayoritaria, así que una reunión típica pasa de ~12 carreras a ~2.
  //
  // ⚠️ ESTE FILTRO ASUME LA SEMÁNTICA DE DOLORES. `es_computable` significa acá
  // "cuenta para el Stud Book", y en Dolores la categoría ONC ("Oficial No
  // Computable") lo tiene en false. Otros clubes ya cargados usan los MISMOS
  // códigos con otro sentido: en 710d43c1 (Jockey Club San Francisco) `ONC` es
  // "Oficial No Clásico" y sí es computable, y `CC` es "Clásico Confirmado" y
  // sí es oficial. Hoy no molesta porque reunion-json está clavado al club de
  // Dolores (CLUB_ID_DOLORES en index.ts) y esos clubes no tienen ni una
  // carrera cargada. El día que entre otro hipódromo hay que revisar que su
  // es_computable quiera decir lo mismo antes de servirle este endpoint.
  // Ver INTEGRACION_STUDBOOK_ESTADO §2.2 y §2.3.
  //
  // El eje son los FLAGS, nunca el `codigo`: el código de tres letras sólo es
  // interpretable dentro de un club.
  //
  // Fail-closed: carrera sin categoria_id, o con una que no está en catMap,
  // NO viaja (no se puede afirmar que sea oficial ni computable).
  const carrerasVisibles = carreras.filter(c => {
    if (c.estado === 'anulada') return false;
    const cat = c.categoria_id ? catMap.get(c.categoria_id) : null;
    return cat?.es_oficial === true && cat?.es_computable === true;
  });

  const carrerasJson = carrerasVisibles.map(c => {
    // "Tiene resultado" = tiene resultado OFICIALIZADO. Un resultado
    // provisional o en_protesta se ignora: la carrera viaja como programa
    // (estado null, puesto '0', sin tiempo, sin estado_pista, sin dividendos,
    // competidores = ratificados). Nuestra regla de publicación.
    const resRaw = resByCarrera.get(c.id) || null;
    const res = resRaw?.estado === 'oficial' ? resRaw : null;
    const hasResult = !!res;

    // competidores: con resultado → los que aparecen en resultado_posiciones;
    // sin resultado → estado='ratificado'.
    const insc = inscByCarrera.get(c.id) || [];
    const comps = hasResult
      ? insc.filter(i => posByInsc.has(i.id))
      : insc.filter(i => i.estado === 'ratificado');

    // MANDIL — se calcula sobre TODAS las inscripciones de la carrera, nunca
    // sobre `comps`. Los dos conjuntos no coinciden: con resultado, `comps`
    // son los que tienen fila en resultado_posiciones, que puede no ser
    // exactamente el set de ratificados. Renumerar `comps` daría mandiles
    // corridos respecto del programa y la carta de llamados ya impresos.
    // Ver docs/YUNTA_MANDIL_ESTADO.md §3.
    // El que no largó (no_largo) conserva su mandil y deja el hueco: es
    // ratificado, así que el mapa se lo asigna igual.
    const mandilMap = renumerarChapas(insc);

    // premios puestos 1..5
    const dist = c.distribucion_premios || {};
    const premios = [];
    for (let puesto = 1; puesto <= 5; puesto++) {
      const pct = dist[String(puesto)];
      if (pct == null) continue;
      let importe = importePuesto(c.bolsa_total, pct, dist.ganancia_minima);
      if (puesto === 1 && dist.bono_ganador) importe += parseFloat(dist.bono_ganador) || 0;
      // Stud Book: puesto e importe como string.
      premios.push({ puesto: str(puesto), importe: str(importe) });
    }

    const competidores = comps
      // Orden de salida por MANDIL. Para los ratificados es equivalente a
      // ordenar por gatera (el mandil es monótono en numero_partidor), pero
      // deja al final a cualquier competidor sin mandil en vez de mezclarlo.
      .sort((a, b) => (mandilMap[a.id] ?? 9999) - (mandilMap[b.id] ?? 9999))
      .map(i => {
        // La fila de resultado_posiciones SÓLO se lee si el resultado está
        // oficializado. Si no, la carrera viaja como programa y no puede
        // filtrar nada de un resultado sin oficializar: ni dividendos
        // (pagaria), ni márgenes (cuerpos), ni distanciamientos.
        const rp = hasResult ? (posByInsc.get(i.id) || null) : null;
        const spc = spcMap.get(i.spc_id) || null;
        const jock = profMap.get(i.jockey_titular_id) || null;
        const cuid = profMap.get(i.entrenador_id) || null;
        const cab = cabMap.get(i.caballeriza_id) || null;

        // JOCKEY QUE MONTO. El schema no tiene una columna de "quien largo":
        // `inscripciones` tiene exactamente dos, `jockey_titular_id` y
        // `jockey_suplente_id`, y `resultado_posiciones` no tiene ninguna.
        // La mejor fuente disponible es el suplente cuando fue designado y el
        // titular cuando no. Hoy `jockey_suplente_id` esta en NULL en los 67
        // competidores de R8, asi que en la practica `jockey` sale igual que
        // `jockey_inscripto` — que es la verdad de lo que sabemos, no un dato
        // inventado, y es estrictamente mejor que los tres null hardcodeados
        // que habia antes.
        //
        // LIMITE QUE HAY QUE CONOCER: un cambio de monta del dia de la carrera
        // que nadie carga en el sistema pisa `jockey_titular_id` o no entra en
        // absoluto, y en los dos casos este campo lo repite sin poder marcarlo.
        // R6 necesito 32 UPDATEs a mano contra la planilla de Yesi (d1600d3);
        // R8 no tuvo esa pasada. Cerrar esto de verdad es agregar la columna
        // del jockey que corrio, no cambiar este mapeo.
        const jockEfectivo = profMap.get(i.jockey_suplente_id ?? i.jockey_titular_id) || null;

        // puesto: sin resultado → "0"; no_largo → "99"; si no → posicion
        let puesto;
        if (!hasResult) puesto = '0';
        else if (rp?.no_largo) puesto = '99';
        else puesto = rp?.posicion != null ? String(rp.posicion) : '0';

        return {
          idCarreraInt: i.id,             // UUID de la inscripción → queda string (no forzar a número)
          puesto,
          estado: null,                 // ignorable v1
          estado_equino_carrera: null,  // ignorable v1
          // orden = MANDIL (número del dorsal, 1..N), NO la gatera.
          // Confirmado por Diego. Sin fallback a numero_partidor: si el
          // competidor no está en el mapa (dejó de ser ratificado después de
          // cargado el resultado) sale null, porque mandar la gatera ahí
          // sería mandar otra cosa con el mismo nombre.
          orden: str(mandilMap[i.id] ?? null),
          yunta: null,                  // columna futura — no existe en el schema
          distanciado: rp?.descalificado ? 'SI' : 'NO',
          motivo_distanciado: rp?.motivo_desc ?? null,
          ejemplar: { nombre: spc?.nombre ?? null, id: str(spc?.studbook_id) },
          kilos_ejemplar: str(i.peso_balanza),
          jockey_inscripto: {
            nombre: nombreCompleto(jock),
            dni: jock?.documento_nro ?? null,
            cuit: null,
          },
          // cuit: no hay columna de CUIT en `profesionales` — no es un dato que
          // falte cargar, no hay donde ponerlo. Fuera del alcance de este fix.
          jockey: {
            nombre: nombreCompleto(jockEfectivo),
            dni: jockEfectivo?.documento_nro ?? null,
            cuit: null,
          },
          cuidador: {
            nombre: nombreCompleto(cuid),
            dni: cuid?.documento_nro ?? null,
            cuit: null,
          },
          caballeriza: {
            // nombre PURO — el sufijo "(XX)" sale por `procedencia`, no acá.
            nombre: nombreCaballerizaLimpio(cab),
            id: str(cab?.id),
            descripcion_chaquetilla: cab?.chaquetilla_descripcion ?? null,
            procedencia: procedenciaCaballeriza(cab),
          },
          jockey_kilos: str2(i.peso_final),
          // cuerpos: id_interno resuelto contra el catálogo de chapas.js.
          // `nombre` SIEMPRE viaja como está en la DB — no se reescribe ni se
          // normaliza el texto; sólo se agrega el id cuando se puede resolver.
          // Sin match (hoy: "nariz") → id_interno null y texto intacto.
          cuerpos: {
            id_interno: resolverChapa(rp?.diferencia).id,
            nombre: rp?.diferencia ?? null,
          },
          pagaria: str(rp?.dividendo),
        };
      });

    return {
      estado: res?.estado ?? null,           // se deja sin convertir
      numero: str(c.numero_carrera_programa ?? c.numero_turno),
      horario: c.hora_estimada,
      premio: c.nombre,
      distancia: str(c.distancia_metros),
      tipo_carrera: { id: c.categoria_id ?? null, nombre: catMap.get(c.categoria_id)?.nombre ?? null },
      tipo_pista: { id: c.tipo_pista ?? null, nombre: c.tipo_pista ?? null },
      estado_pista: { id: res?.estado_pista ?? null, nombre: res?.estado_pista ?? null },
      tipo_codo: { id: null, nombre: null },
      condicion: {
        texto: c.condicion_handicap ?? c.condicion_adicional ?? null,
        edaddesde: c.edad_minima_anos,
        edadhasta: c.edad_maxima_anos,
        sexo: mapSexo(c.condicion_sexo),
        ganadadesde: null,
        ganadahasta: null,
      },
      tiempo: parseTiempo(res?.tiempo_ganador),
      // Array simple [ {...} ]. El doble-anidado [[...]] del formato de
      // referencia (La Punta) era un error; Diego confirmó aplanar (2026-06-12).
      premios,
      competidores_cantidad: competidores.length, // se deja sin convertir
      competidores,
    };
  });

  return {
    status: 200,
    data: {
      id: reunion.id,
      titulo_reunion: null, // gap v1
      fecha: { date: reunion.fecha, timezone: tz },
      hipodromo: { nombre: hipodromo?.nombre ?? null, id: null },
      carreras: carrerasJson,
    },
  };
}

// ---------- inline: index.ts ----------
// ============================================================
// Edge Function: reunion-json
// ============================================================
// Expone el JSON de reunión del Stud Book POR FECHA, scope Dolores.
//
//   GET /reunion-json?fecha=YYMMDD   (ej 990101 → 2099-01-01)
//   Auth: SÓLO header  Authorization: Bearer <STUDBOOK_API_TOKEN>
//
//   El soporte de ?token= por query string se eliminó (2026-08-03): los query
//   params quedan registrados en logs de acceso, proxies intermedios e
//   historial del cliente, o sea que era una vía de fuga del token
//   independiente de cualquier otra. Ver docs/ROTACION_STUDBOOK_FASE0.md §1.
//
// Devuelve EXACTAMENTE el mismo JSON que tools/studbook_reunion_json.mjs:
// usa la MISMA buildReunionJson() compartida (_shared/studbook_format.mjs),
// mismos selects, y JSON.stringify(out, null, 2) → idéntico byte a byte.
//
// Secretos (NUNCA en el código, se setean en el env de la función):
//   STUDBOOK_DB_KEY    → sb_secret_... (server-side, bypassa RLS). NO usar la
//                        legacy service_role eyJ (desactivada 2026-06-07).
//   STUDBOOK_API_TOKEN → token que exige al cliente.
// SUPABASE_URL lo inyecta la plataforma; fallback al URL del proyecto.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://unlhcuanfrtpatoipwve.supabase.co';
const DB_KEY = Deno.env.get('STUDBOOK_DB_KEY') ?? '';
const API_TOKEN = Deno.env.get('STUDBOOK_API_TOKEN') ?? '';
const CLUB_ID_DOLORES = '0649e9c5-9e87-4aad-842f-101458e6b33c';
const TZ = 'America/Argentina/Buenos_Aires';

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

// Extrae el token SÓLO de Authorization: Bearer <x>.
// No se acepta por query string: ?token= deja el secreto en logs de acceso,
// proxies e historial. Un cliente que llame con ?token= recibe 401.
function extractToken(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  return null;
}

// YYMMDD → "20YY-MM-DD" (ej 990101 → 2099-01-01). null si no es válido.
function fechaFromParam(raw: string | null): string | null {
  if (!raw || !/^\d{6}$/.test(raw)) return null;
  const yy = raw.slice(0, 2), mm = raw.slice(2, 4), dd = raw.slice(4, 6);
  const m = parseInt(mm, 10), d = parseInt(dd, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `20${yy}-${mm}-${dd}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // 1) AUTH obligatoria — sin token válido → 401.
  if (!API_TOKEN) return json({ status: 500, error: 'server misconfigured: STUDBOOK_API_TOKEN unset' }, 500);
  const token = extractToken(req);
  if (!token || token !== API_TOKEN) {
    return json({ status: 401, error: 'unauthorized' }, 401);
  }

  if (!DB_KEY) return json({ status: 500, error: 'server misconfigured: STUDBOOK_DB_KEY unset' }, 500);

  // 2) fecha → date
  const fecha = fechaFromParam(url.searchParams.get('fecha'));
  if (!fecha) return json({ status: 400, error: 'fecha inválida (esperado YYMMDD, ej 990101)' }, 400);

  const db = createClient(SUPABASE_URL, DB_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const die = (ctx: string, err: unknown) => { throw new Error(`[${ctx}] ${JSON.stringify(err)}`); };
  const fetchByIds = async (tabla: string, ids: unknown[], cols = '*') => {
    const clean = [...new Set(ids.filter(Boolean))];
    if (!clean.length) return new Map();
    const { data, error } = await db.from(tabla).select(cols).in('id', clean);
    if (error) die(`fetch ${tabla}`, error);
    return new Map((data ?? []).map((r: any) => [r.id, r]));
  };

  try {
    // 3) Reunión Dolores en esa fecha → 404 limpio si no hay.
    const { data: reunion, error: eR } = await db
      .from('reuniones')
      // Contrato ADITIVO: numero_publico se suma, numero NO se saca. La
      // integracion de Diego sigue andando sin tocar nada; cuando quiera
      // migrar al numero publico, el campo ya esta.
      .select('id, fecha, hipodromo_id, numero, numero_publico, estado')
      .eq('club_id', CLUB_ID_DOLORES)
      .eq('fecha', fecha)
      .maybeSingle();
    if (eR) die('reunion', eR);
    if (!reunion) return json({ status: 404, data: null, error: `sin reunión para fecha ${fecha}` }, 404);

    const reunionId = reunion.id;

    let hipodromo: any = null;
    if (reunion.hipodromo_id) {
      const { data, error } = await db
        .from('hipodromos').select('id, nombre').eq('id', reunion.hipodromo_id).single();
      if (error) die('hipodromo', error);
      hipodromo = data;
    }

    const { data: carreras, error: eC } = await db
      .from('carreras').select('*').eq('reunion_id', reunionId)
      .order('numero_turno', { ascending: true });
    if (eC) die('carreras', eC);
    const carreraIds = (carreras ?? []).map((c: any) => c.id);

    let resByCarrera = new Map();
    if (carreraIds.length) {
      const { data, error } = await db.from('resultados').select('*').in('carrera_id', carreraIds);
      if (error) die('resultados', error);
      resByCarrera = new Map((data ?? []).map((r: any) => [r.carrera_id, r]));
    }

    const inscByCarrera = new Map();
    let allInsc: any[] = [];
    if (carreraIds.length) {
      const { data, error } = await db.from('inscripciones').select('*').in('carrera_id', carreraIds);
      if (error) die('inscripciones', error);
      allInsc = data ?? [];
      for (const i of allInsc) {
        if (!inscByCarrera.has(i.carrera_id)) inscByCarrera.set(i.carrera_id, []);
        inscByCarrera.get(i.carrera_id).push(i);
      }
    }

    const resultadoIds = [...resByCarrera.values()].map((r: any) => r.id);
    let posByInsc = new Map();
    if (resultadoIds.length) {
      const { data, error } = await db.from('resultado_posiciones').select('*').in('resultado_id', resultadoIds);
      if (error) die('resultado_posiciones', error);
      posByInsc = new Map((data ?? []).map((p: any) => [p.inscripcion_id, p]));
    }

    // es_oficial es OBLIGATORIO: el builder filtra las carreras por ese flag.
    const catMap = await fetchByIds('categorias_carrera', (carreras ?? []).map((c: any) => c.categoria_id),
      'id, nombre, codigo, es_oficial, es_computable');
    // jockey_suplente_id entra al lookup: buildReunionJson resuelve el jockey
    // que monto como `suplente ?? titular`. Sin este id el bloque `jockey`
    // saldria null cada vez que hubiera un suplente designado.
    const profIds = allInsc.flatMap((i) => [i.jockey_titular_id, i.jockey_suplente_id, i.entrenador_id]);
    const profMap = await fetchByIds('profesionales', profIds, 'id, nombre, apellido, documento_nro');
    const cabMap = await fetchByIds('caballerizas', allInsc.map((i) => i.caballeriza_id),
      'id, nombre, chaquetilla_descripcion, hipodromo_patente');
    const spcMap = await fetchByIds('spcs', allInsc.map((i) => i.spc_id), 'id, nombre, studbook_id');

    const out = buildReunionJson({
      reunion, hipodromo, carreras: carreras ?? [],
      resByCarrera, inscByCarrera, posByInsc,
      catMap, profMap, cabMap, spcMap,
      tz: TZ,
    });

    return json(out, 200);
  } catch (err) {
    console.error('[reunion-json]', err);
    return json({ status: 500, error: 'internal error' }, 500);
  }
});

