// Edad de un SPC segun el Reglamento General de Carreras.
//
// En hipismo la edad NO es cronologica: "la edad de los caballos se contara desde el
// 1° de julio de cada ano". Todos los SPC cumplen anos el 1 de julio, sin importar su
// fecha real de nacimiento. Un potrillo nacido el 02/09/2018 cumple 8 el 01/07/2026,
// aunque su aniversario real caiga en septiembre.
//
//   edad = anioReferencia - anioNacimiento
//   si la fecha de referencia es ANTERIOR al 1 de julio de ese anio  ->  edad -= 1
//
// La fecha de referencia es la FECHA DE LA REUNION, no "hoy": un programa reimpreso en
// otra fecha tiene que mostrar las mismas edades que el original. Solo las pantallas de
// ABM y de busqueda, que no cuelgan de ninguna reunion, usan la fecha actual.
(function (global) {

  // Acepta 'YYYY-MM-DD' (lo que devuelve Supabase para date), un Date, o un ISO completo.
  // Las fechas 'YYYY-MM-DD' se parsean a mano: new Date('2018-09-02') las interpreta como
  // UTC y en Argentina (UTC-3) puede correrlas un dia para atras.
  function partesFecha(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      return isNaN(v.getTime()) ? null
        : { anio: v.getFullYear(), mes: v.getMonth() + 1, dia: v.getDate() };
    }
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { anio: +m[1], mes: +m[2], dia: +m[3] };
    const d = new Date(v);
    return isNaN(d.getTime()) ? null
      : { anio: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() };
  }

  function hoyPartes() {
    const d = new Date();
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, dia: d.getDate() };
  }

  // edadSPC(fechaNacimiento, fechaReferencia) -> Number | '' si falta el dato.
  // fechaReferencia por defecto = hoy (solo para pantallas sin reunion).
  function edadSPC(fechaNacimiento, fechaReferencia) {
    const nac = partesFecha(fechaNacimiento);
    if (!nac) return '';
    const ref = partesFecha(fechaReferencia) || hoyPartes();
    let edad = ref.anio - nac.anio;
    if (ref.mes < 7) edad--;          // antes del 1 de julio todavia no cumplio
    return edad < 0 ? 0 : edad;
  }

  // Variante con sufijo, para las pantallas que muestran "4 años" en vez del numero pelado.
  function edadSPCTexto(fechaNacimiento, fechaReferencia, sufijoCorto) {
    const e = edadSPC(fechaNacimiento, fechaReferencia);
    if (e === '') return '';
    if (sufijoCorto) return `${e} a.`;
    return `${e} año${e === 1 ? '' : 's'}`;
  }

  global.edadSPC = edadSPC;
  global.edadSPCTexto = edadSPCTexto;
})(typeof window !== 'undefined' ? window : globalThis);
