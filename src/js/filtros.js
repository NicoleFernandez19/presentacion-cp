/* Estado de filtros de la presentación. En modo reunión no hay barra ni
   interacción, con una sola excepción: el selector de tipo de operación
   (Todos / SF2 sin TEC / MT / TEC) dentro de la lámina (esquina superior derecha, visible en pantalla completa). El resto
   del estado queda fijo en el inicial (año completo, toda la red). La única
   señal que se lee de la URL es la lámina (#l=N), para volver a una. */
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
      Filtros.render();
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

    /* Selector de tipo de operación: dentro del marco de la lámina, para que siga a la vista en pantalla completa. */
    render: function () {
      const destino = global.document && global.document.getElementById('slide-frame');
      if (!destino || destino.querySelector('.selector-grupo')) return;
      const dim = (global.Datos.raw.dim.grupos) || [];
      const opciones = [{ rotulo: 'Todos', indice: null }];
      [['SF2 sin TEC', 'SF2 (sin TEC)'], ['MT', 'MT'], ['TEC', 'TEC']].forEach(function (par) {
        const indice = dim.indexOf(par[0]);
        if (indice >= 0) opciones.push({ rotulo: par[1], indice: indice, titulo: global.Datos.descripcionGrupo(indice) });
      });
      if (opciones.length < 3) return;
      const caja = global.document.createElement('div');
      caja.className = 'selector-grupo no-imprimir';
      caja.setAttribute('role', 'group');
      caja.setAttribute('aria-label', 'Tipo de operación');
      opciones.forEach(function (o) {
        const b = global.document.createElement('button');
        b.type = 'button';
        b.textContent = o.rotulo;
        if (o.titulo) b.title = o.titulo;
        b.addEventListener('click', function () {
          Filtros.estado.grupos = o.indice === null ? [] : [o.indice];
          Array.prototype.forEach.call(caja.children, function (x) {
            x.classList.toggle('activo', x === b);
          });
          b.blur();
          Filtros.cambio();
        });
        if (o.indice === null) b.classList.add('activo');
        caja.appendChild(b);
      });
      destino.appendChild(caja);
    },

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
