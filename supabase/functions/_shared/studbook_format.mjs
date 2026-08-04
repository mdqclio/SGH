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

import { renumerarChapas } from './mandil.mjs';
import { resolverChapa } from './chapas_map.mjs';

export const TZ_DEFAULT = 'America/Argentina/Buenos_Aires';

// max(bolsa*pct/100, ganancia_minima) — réplica de premios-utils.js#calcPremiosConPiso
export function importePuesto(bolsa, pct, minimo) {
  const calc = (parseFloat(bolsa) || 0) * (parseFloat(pct) || 0) / 100;
  const min = parseFloat(minimo) || 0;
  return (min > 0 && calc < min) ? min : calc;
}

// Parte un tiempo_ganador (varchar libre) en {minutos, segundos, decimas}.
// Formatos tolerados: "M:SS.d", "M:SS", "SS.d", "SS", numérico de segundos.
// Si no se puede parsear (o es null), devuelve los tres campos en null.
export function parseTiempo(raw) {
  const empty = { minutos: null, segundos: null, decimas: null };
  if (raw == null) return empty;
  const s = String(raw).trim();
  if (!s) return empty;
  let minutos = 0, resto = s;
  if (s.includes(':')) {
    const [m, r] = s.split(':');
    minutos = parseInt(m, 10) || 0;
    resto = r;
  }
  let segundos = 0, decimas = 0;
  if (resto.includes('.')) {
    const [seg, dec] = resto.split('.');
    segundos = parseInt(seg, 10) || 0;
    decimas = parseInt(dec, 10) || 0;
  } else {
    segundos = parseInt(resto, 10) || 0;
  }
  if (Number.isNaN(minutos) && Number.isNaN(segundos)) return empty;
  return { minutos, segundos, decimas };
}

// 'ambos' → 'T'; otros valores se pasan tal cual (gap de mapeo definitivo).
export function mapSexo(s) {
  if (s == null) return null;
  return s === 'ambos' ? 'T' : s;
}

// Procedencia de la caballeriza: hipodromo_patente si existe; si no, el sufijo
// entre paréntesis del nombre (ej. "Stud X (SL)" → "SL"); si no hay, null.
export function procedenciaCaballeriza(cab) {
  if (!cab) return null;
  if (cab.hipodromo_patente) return cab.hipodromo_patente;
  const m = /\(([^)]+)\)\s*$/.exec(cab.nombre || '');
  return m ? m[1].trim() : null;
}

export function nombreCompleto(p) {
  if (!p) return null;
  return [p.nombre, p.apellido].filter(Boolean).join(' ') || null;
}

// Calco de formato Stud Book: numéricos van como string. null pasa tal cual.
export function str(v) {
  return v == null ? null : String(v);
}
// Idem pero con 2 decimales fijos (ej. kilos jockey "57.00").
export function str2(v) {
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
export function buildReunionJson({
  reunion, hipodromo, carreras,
  resByCarrera, inscByCarrera, posByInsc,
  catMap, profMap, cabMap, spcMap,
  tz = TZ_DEFAULT,
}) {
  // ------------------------------------------------------------
  // Qué carreras VIAJAN. Conjunto fijo, dos condiciones y nada más:
  //   1. la CATEGORÍA de la carrera es oficial (categorias_carrera.es_oficial)
  //   2. la carrera no está anulada
  //
  // El estado del RESULTADO no filtra carreras — sólo decide si se adjunta
  // el resultado (ver `res` más abajo). Una carrera con resultado provisional
  // viaja igual, como programa.
  //
  // El eje es el FLAG es_oficial, nunca el `codigo`: hay clubes que reusan
  // los códigos OC/ONC/CC con otra semántica (p.ej. en 710d43c1 `ONC` es
  // "Oficial No Clásico" y es computable). Ver INTEGRACION_STUDBOOK_ESTADO §2.2.
  //
  // Fail-closed: carrera sin categoria_id, o con una que no está en catMap,
  // NO viaja (no se puede afirmar que sea oficial).
  const carrerasVisibles = carreras.filter(c => {
    if (c.estado === 'anulada') return false;
    const cat = c.categoria_id ? catMap.get(c.categoria_id) : null;
    return cat?.es_oficial === true;
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
          jockey: { nombre: null, dni: null, cuit: null }, // v1
          cuidador: {
            nombre: nombreCompleto(cuid),
            dni: cuid?.documento_nro ?? null,
            cuit: null,
          },
          caballeriza: {
            nombre: cab?.nombre ?? null,
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
