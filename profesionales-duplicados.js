// Aviso de fichas parecidas antes de dar de alta un profesional (entrenador o jockey).
//
// Por qué existe: `profesionales` NO tiene ningún índice único sobre el documento — los únicos
// índices de la tabla son `profesionales_pkey` y `idx_profesionales_club` (medido el 2026-09-10).
// Su tabla hermana `propietarios` sí lo tiene (`ux_propietarios_club_doc`), así que ahí un alta
// repetida del mismo DNI choca contra la base. Acá no choca contra nada: entra igual y quedan dos
// fichas de la misma persona.
//
// Hasta ahora eso no dolía porque el padrón entró por importación y el alta por pantalla estaba
// reservada a super_admin. Con la secretaría cargando entrenadores a mano y de a uno, el alta
// pasa a ser el camino habitual y el riesgo se vuelve real.
//
// NO BLOQUEA, y es a propósito. En este padrón compartir apellido es lo NORMAL, no la excepción:
// en Dolores hay 5 DIESTRA, 5 GONZALEZ, 3 CANTO y 3 ALDAY, todas personas distintas. Y el caso
// que motiva el aviso es justamente un falso positivo de apellido: ZUBIARRAIN, SANTIAGO
// (entrenador, DNI 14527442) y ZUBIRIA, SANTIAGO (jockey, DNI 39342378) son dos personas. Un
// aviso que corta el alta se volvería ruido y se aprendería a saltear en una semana.
//
// Por eso se separan dos señales de fuerza muy distinta:
//
//   · MISMO DOCUMENTO en el mismo club → es un duplicado real. Señal fuerte.
//   · APELLIDO PARECIDO               → es lo esperable. Señal débil, informativa, y siempre
//                                       con el DNI a la vista para poder descartarla de un vistazo.
//
// Las dos consultas van acotadas por club: una ficha de otro hipódromo no es un duplicado de ésta
// (entrenadores y jockeys son per-hipódromo, GOTCHA #13).
(function (global) {

  const LIMITE_APELLIDO = 8;

  // Normaliza para comparar: sin acentos, sin dobles espacios, minúsculas.
  // 'ACUÑA' y 'Acuna' tienen que caer en la misma bolsa.
  function normalizar(s) {
    return String(s ?? '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Sólo dígitos, igual que el parseDNI de las pantallas. Un documento vacío no es señal de nada.
  function soloDigitos(s) {
    return String(s ?? '').replace(/\D/g, '');
  }

  // Escapa los comodines de PostgREST para que un apellido con % o _ no se convierta en un
  // patrón que matchea de más. `\` va primero o se escapa a sí mismo dos veces.
  function escaparLike(s) {
    return String(s ?? '').replace(/\\/g, '\\\\').replace(/[%_]/g, c => '\\' + c);
  }

  // buscarProfesionalesParecidos(sb, opts) -> { porDocumento, porApellido, consultado }
  //
  //   sb        cliente Supabase ya creado
  //   opts.clubId        club activo — obligatorio; sin club no se busca nada
  //   opts.apellido      apellido tipeado en el formulario
  //   opts.nombre        nombre tipeado (sólo se usa para ordenar, no para filtrar)
  //   opts.documentoNro  documento tipeado, con o sin puntos
  //   opts.excluirId     id de la ficha que se está editando, para que no se avise a sí misma
  //
  // `consultado` dice si realmente se fue a la base: con el formulario vacío no se consulta y
  // devolver dos arrays vacíos sería ambiguo (¿no hay parecidos, o no se buscó?).
  async function buscarProfesionalesParecidos(sb, opts = {}) {
    const { clubId, apellido, nombre, documentoNro, excluirId } = opts;
    const vacio = { porDocumento: [], porApellido: [], consultado: false };
    if (!sb || !clubId) return vacio;

    const doc = soloDigitos(documentoNro);
    const ape = String(apellido ?? '').trim();
    // Un apellido de 1-2 letras haría un ilike que trae medio padrón. No es una señal.
    const apeSirve = normalizar(ape).length >= 3;
    if (!doc && !apeSirve) return vacio;

    const COLS = 'id,nombre,apellido,tipo,documento_tipo,documento_nro,estado,hipodromo_patente';
    const descartar = (filas) => (filas || []).filter(f => f.id !== excluirId);

    // 1) Mismo documento en el mismo club. Es el duplicado de verdad.
    let porDocumento = [];
    if (doc) {
      const { data, error } = await sb.from('profesionales').select(COLS)
        .eq('club_id', clubId).eq('documento_nro', doc).limit(5)
        .then(r => r, err => { console.error('[buscarProfesionalesParecidos/doc]', err); throw err; });
      if (error) { console.error('[buscarProfesionalesParecidos/doc]', error); throw error; }
      porDocumento = descartar(data);
    }

    // 2) Apellido parecido, siempre — también cuando el DNI ya matcheó, porque puede haber una
    //    segunda ficha de la misma persona cargada SIN documento (40 de las 185 no tienen).
    let porApellido = [];
    if (apeSirve) {
      const patron = `%${escaparLike(ape)}%`;
      const { data, error } = await sb.from('profesionales').select(COLS)
        .eq('club_id', clubId).ilike('apellido', patron)
        .order('apellido').order('nombre').limit(LIMITE_APELLIDO)
        .then(r => r, err => { console.error('[buscarProfesionalesParecidos/ape]', err); throw err; });
      if (error) { console.error('[buscarProfesionalesParecidos/ape]', error); throw error; }
      const yaEstan = new Set(porDocumento.map(f => f.id));
      porApellido = descartar(data).filter(f => !yaEstan.has(f.id));
    }

    return { porDocumento, porApellido, consultado: true };
  }

  global.buscarProfesionalesParecidos = buscarProfesionalesParecidos;
  // Exportadas para poder testearlas sueltas; las pantallas usan sólo la de arriba.
  global._dupNormalizar = normalizar;
  global._dupEscaparLike = escaparLike;
})(typeof window !== 'undefined' ? window : globalThis);
