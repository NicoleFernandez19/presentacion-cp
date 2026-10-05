/* Arranque: arma el motor sobre los datos embebidos, cablea filtros y
   navegación, y pinta la primera lámina. */
(function (global) {
  'use strict';

  function iniciar() {
    const datos = global.DATOS;
    if (!datos) {
      document.getElementById('slide-viewport').innerHTML =
        '<div class="vacio"><div class="titulo">No hay datos embebidos</div>' +
        '<div class="detalle">Este archivo se generó sin datos. Volvé a correr scripts/preparar_datos.py.</div></div>';
      return;
    }

    const motor = global.Metricas.crearMotor(datos, datos.config);
    global.Datos.inicializar(datos, motor);

    const sello = document.getElementById('sello-datos');
    if (sello) {
      sello.textContent =
        '· datos al ' + datos.meta.fecha_corte +
        ' · generado ' + datos.meta.generado;
    }

    global.Filtros.inicializar(motor, function () {
      global.Navegacion.renderSlide();
    });

    if (global.Filtros.laminaInicial) {
      global.Navegacion.indiceActual = Math.max(0, global.Filtros.laminaInicial - 1);
    }

    global.Navegacion.conectarEventos();
    global.Navegacion.renderSlide();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(typeof globalThis !== 'undefined' ? globalThis : this);
