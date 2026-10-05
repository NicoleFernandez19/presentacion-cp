/* Estado de filtros de la presentación. En modo reunión no hay barra ni
   interacción: el estado queda fijo en el inicial (año completo, toda la red)
   y los métodos que cambiaban filtros o dibujaban controles son inertes. La
   única señal que se lee de la URL es la lámina (#l=N), para volver a una. */
(function (global) {
  'use strict';

  const Filtros = {
    estado: null,
    motor: null,
    alCambiar: null,
    _abierto: null,

    inicializar: function (motor, alCambiar) {
      Filtros.motor = motor;
      Filtros.alCambiar = alCambiar;
      Filtros.estado = Filtros.estadoInicial();
      Filtros.leerUrl();
      return Filtros.estado;
    },

    estadoInicial: function () {
      const meta = Filtros.motor.datos.meta;
      return {
        periodo: { modo: 'anio', anio: meta.anio_actual },
        jefes: [],
        tiposZona: [],
        localidades: [],
        locales: [],
        grupos: [],
        tipos: [],
        compararAnioAnterior: false,
        mostrarNombres: Filtros.motor.datos.config.presentacion.mostrar_nombres_cajeros !== false
      };
    },

    // ------------------------------------------------------------- cascada

    /* Descarta lo que dejó de existir. Manda el filtro más grueso: primero se
       valida jefe zonal, después localidad y recién al final local, así cambiar
       de jefe suelta el local elegido y no al revés (§5). */
    depurar: function () {
      const e = Filtros.estado;
      const orden = ['tiposZona', 'jefes', 'localidades', 'locales', 'grupos', 'tipos'];
      orden.forEach(function (campo) {
        if (!e[campo].length) return;
        const disponibles = new Set(Filtros.motor.opcionesFiltros(e)[campo]);
        e[campo] = e[campo].filter(function (v) {
          return disponibles.has(v);
        });
      });
    },

    // -------------------------------------------------------------- render

    /* Sin barra de filtros: nada que dibujar. */
    render: function () {},

    /* Un clic en un jefe zonal, localidad o local dentro de un gráfico aplica
       ese filtro. Inerte en modo reunión. */
    alternar: function () {},

    cambio: function () {
      global.Datos.mostrarNombres = Filtros.estado.mostrarNombres;
      if (Filtros.alCambiar) Filtros.alCambiar();
    },

    // ----------------------------------------------------------------- URL

    escribirUrl: function () {},

    leerUrl: function () {
      const m = /(?:^|&)l=(\d+)/.exec(global.location.hash.replace(/^#/, ''));
      if (m) Filtros.laminaInicial = +m[1];
      global.Datos.mostrarNombres = Filtros.estado.mostrarNombres;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Filtros;
  else global.Filtros = Filtros;
})(typeof globalThis !== 'undefined' ? globalThis : this);
