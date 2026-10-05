/* Formato argentino: punto de miles, coma decimal, fechas dd/mm/aaaa. */
(function (global) {
  'use strict';

  const LOCALE = 'es-AR';
  const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const cacheFormatos = new Map();
  function formateador(decimales) {
    if (!cacheFormatos.has(decimales)) {
      cacheFormatos.set(
        decimales,
        new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
      );
    }
    return cacheFormatos.get(decimales);
  }

  function numero(valor, decimales) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
    return formateador(decimales === undefined ? 0 : decimales).format(valor);
  }

  function entero(valor) {
    return numero(valor, 0);
  }

  function decimal(valor, decimales) {
    return numero(valor, decimales === undefined ? 1 : decimales);
  }

  function porcentaje(valor, decimales) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
    return numero(valor, decimales === undefined ? 1 : decimales) + '%';
  }

  function variacion(valor, decimales) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
    const signo = valor > 0 ? '+' : '';
    return signo + numero(valor, decimales === undefined ? 1 : decimales) + '%';
  }

  /* Números grandes para ejes y tarjetas: 1.234.567 -> "1,2 M". */
  function compacto(valor) {
    if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
    const abs = Math.abs(valor);
    if (abs >= 1e9) return numero(valor / 1e9, 1) + ' MM';
    if (abs >= 1e6) return numero(valor / 1e6, 1) + ' M';
    if (abs >= 1e3) return numero(valor / 1e3, 1) + ' k';
    return numero(valor, 0);
  }

  /* aaaammdd -> dd/mm/aaaa */
  function fecha(valor) {
    if (!valor) return '—';
    const texto = String(valor);
    if (texto.length !== 8) return '—';
    return texto.slice(6, 8) + '/' + texto.slice(4, 6) + '/' + texto.slice(0, 4);
  }

  /* aaaamm -> "agosto 2026" */
  function mes(periodo) {
    const anio = Math.floor(periodo / 100);
    const m = (periodo % 100) - 1;
    return MESES[m] + ' ' + anio;
  }

  /* aaaamm -> "ago 26" */
  function mesCorto(periodo) {
    const anio = Math.floor(periodo / 100);
    const m = (periodo % 100) - 1;
    return MESES_CORTOS[m] + ' ' + String(anio).slice(2);
  }

  function mesNombre(numeroMes) {
    return MESES[numeroMes - 1];
  }

  function capitalizar(texto) {
    if (!texto) return '';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function rangoPeriodos(lista) {
    if (!lista || !lista.length) return '—';
    if (lista.length === 1) return capitalizar(mes(lista[0]));
    return capitalizar(mes(lista[0])) + ' a ' + mes(lista[lista.length - 1]);
  }

  const API = {
    numero: numero,
    entero: entero,
    decimal: decimal,
    porcentaje: porcentaje,
    variacion: variacion,
    compacto: compacto,
    fecha: fecha,
    mes: mes,
    mesCorto: mesCorto,
    mesNombre: mesNombre,
    capitalizar: capitalizar,
    rangoPeriodos: rangoPeriodos,
    MESES: MESES,
    MESES_CORTOS: MESES_CORTOS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Formato = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
