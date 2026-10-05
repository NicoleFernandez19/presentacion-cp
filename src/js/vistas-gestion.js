/* Cierre de la sección «Avances y retrocesos»: la única comparación de locales
   del mazo donde el potencial de la plaza está controlado (D-27).

   Quedó una sola lámina. Las otras tres que hubo acá —«Los tres grupos del
   año», «La cola que se puede recuperar» y «Dónde está la diferencia»— se
   sacaron entre el 2026-09-23 y el 2026-09-24, todas por el mismo motivo: sin
   una medida del potencial de cada plaza, cualquier ranking de locales o de
   personas termina midiendo cuánta gente pasa por la puerta y no cómo se
   trabaja. Comparar dos locales del mismo barrio y del mismo jefe zonal es lo
   único que esquiva ese problema.

   `motor.gestionZonal()` sigue calculando el índice, la cola crónica y el
   rendimiento de cada local contra su grupo de pares: no se muestran, pero son
   la evidencia de D-27 y vuelven a servir el día que haya `plazas.csv`. */
(function (global) {
  'use strict';

  const SECCION = 'Rankings';

  function F() {
    return global.Formato;
  }

  function vacio(host, lamina, detalle) {
    const cuerpo = UI.cabecera(host, lamina, 'No hay datos con los filtros seleccionados.');
    cuerpo.appendChild(UI.vacio('Sin datos para este recorte', detalle));
  }

  function conf() {
    return global.Datos.config.gestion_zonal || {};
  }

  function gestion(ctx) {
    return global.Filtros.motor.gestionZonal(ctx.periodos);
  }

  function seleccionados() {
    return new Set(global.Filtros.estado.jefes || []);
  }


  // -------------------------------------------- brecha dentro de la plaza

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Dos locales, la misma cuadra',
    subtitulo: 'Localidades donde un jefe zonal tiene varios puntos y uno rinde bastante menos que su vecino.',
    render: function (host, ctx) {
      const Datos = global.Datos;
      const g = gestion(ctx);
      const elegidos = seleccionados();
      const visibles = elegidos.size ? g.brechas.filter((b) => elegidos.has(b.jefe)) : g.brechas;

      if (ctx.vacio || !visibles.length) {
        const cuerpo = UI.cabecera(
          host,
          this,
          'Ninguna localidad con más de un local del mismo jefe zonal muestra una brecha de ' +
            F().decimal((conf().brecha_plaza || {}).ratio_minimo, 1) + 'x o más.'
        );
        cuerpo.appendChild(
          UI.vacio(
            'Sin brechas por encima del umbral',
            'Se comparan solo locales con al menos ' + (conf().brecha_plaza || {}).minimo_meses_local +
              ' meses de actividad, así que las aperturas y las mudanzas del año quedan afuera.',
            false
          )
        );
        return;
      }

      const total = visibles.reduce((acc, b) => acc + b.oportunidad, 0);
      const porcentaje = g.opsTotales > 0 ? (total / g.opsTotales) * 100 : 0;
      const cuerpo = UI.cabecera(
        host,
        this,
        'Son <strong>' + F().entero(visibles.length) + '</strong> localidades. Si el punto flojo de cada una ' +
          'rindiera como su vecino, serían <strong>' + F().entero(Math.round(total)) + '</strong> operaciones más, ' +
          F().porcentaje(porcentaje, 2) + ' del período.'
      );

      const filas = [];
      visibles.forEach(function (b) {
        b.locales.forEach(function (l, i) {
          filas.push({
            localidad: b.localidad,
            jefe: b.jefe,
            local: l.local,
            rinde: l.rinde,
            cajeroMes: l.cajeroMes,
            ops: l.ops,
            meses: l.meses,
            esMejor: i === 0,
            esPeor: i === b.locales.length - 1 && b.locales.length > 1,
            ratio: i === 0 ? b.ratio : null,
            oportunidad: i === b.locales.length - 1 ? b.oportunidad : null
          });
        });
      });

      const panel = UI.panel('Localidad por localidad', 'ordenadas por lo que hay en juego');
      panel.querySelector('.panel-titulo').appendChild(
        UI.botonCsv('CSV', function () {
          Datos.descargarCsv(
            'brecha-por-plaza',
            ['localidad', 'jefe_zonal', 'local', 'ops_por_cajero_mes', 'cajero_mes', 'operaciones', 'meses'],
            filas.map(function (f) {
              return [
                Datos.localidad(f.localidad),
                Datos.jefe(f.jefe),
                Datos.local(f.local),
                Datos.numeroCsv(f.rinde, 0),
                f.cajeroMes,
                Datos.numeroCsv(f.ops, 0),
                f.meses
              ];
            })
          );
        })
      );
      cuerpo.appendChild(panel);

      panel.appendChild(
        UI.tabla({
          ordenable: false,
          columnas: [
            {
              titulo: 'Localidad',
              num: false,
              render: function (f, i) {
                if (i > 0 && filas[i - 1].localidad === f.localidad && filas[i - 1].jefe === f.jefe) return '';
                return '<strong>' + Datos.localidad(f.localidad) + '</strong>';
              }
            },
            {
              titulo: 'Jefe zonal',
              num: false,
              render: function (f, i) {
                if (i > 0 && filas[i - 1].localidad === f.localidad && filas[i - 1].jefe === f.jefe) return '';
                return Datos.jefe(f.jefe);
              }
            },
            { titulo: 'Local', num: false, render: (f) => Datos.local(f.local) },
            {
              titulo: 'Ops./cajero-mes',
              num: true,
              ayuda: 'Mediana de operaciones por cajero y por mes en ese local',
              render: function (f) {
                const color = f.esMejor
                  ? Datos.color('positivo')
                  : f.esPeor
                    ? Datos.color('negativo')
                    : Datos.color('referencia');
                return '<span style="color:' + color + ';font-weight:700">' + F().entero(Math.round(f.rinde)) + '</span>';
              }
            },
            { titulo: 'Cajero-mes', num: true, render: (f) => F().entero(f.cajeroMes) },
            { titulo: 'Ops. del período', num: true, render: (f) => F().entero(f.ops) },
            {
              titulo: 'Brecha',
              num: true,
              ayuda: 'Cuántas veces rinde más el mejor punto de la localidad que el flojo',
              render: (f) => (f.ratio === null ? '' : '<span class="destacado">' + F().decimal(f.ratio, 2) + 'x</span>')
            },
            {
              titulo: 'En juego',
              num: true,
              ayuda: 'Operaciones que sumaría el punto flojo si rindiera como el mejor',
              render: (f) => (f.oportunidad === null ? '' : F().entero(Math.round(f.oportunidad)))
            }
          ],
          filas: filas,
          alClic: function (f) {
            global.Filtros.alternar('locales', f.local);
          }
        })
      );
    },
    notas: function (ctx) {
      const g = gestion(ctx);
      const cb = conf().brecha_plaza || {};
      const primera = g.brechas[0];
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">' +
        '"Acá no hay potencial de plaza que valga: son locales de la misma localidad y del mismo jefe zonal. ' +
        'Si uno rinde el doble que el de al lado, la pregunta es qué tiene uno que no tenga el otro, y ' +
        'cuántas personas hay puestas en cada uno."' +
        '</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>Se comparan <strong>operaciones por cajero-mes</strong>, no totales: un local con el doble de gente ' +
        'debería hacer el doble de volumen, y eso no es mérito.</p>' +
        '<p>Esta es <strong>la única comparación del mazo donde el potencial está controlado</strong>. ' +
        'En cualquier otro ranking de locales no se puede separar «plaza floja» de «local mal trabajado». ' +
        'Y entre personas no hay nada que buscar: dentro de un mismo local todos rinden parecido ' +
        '(4 cajeros de 663 quedan bajo el 60% de sus compañeros de mostrador).</p>' +
        '<p>Entran solo los locales con <strong>' + cb.minimo_meses_local + ' meses o más</strong> de actividad. ' +
        'Una apertura reciente o un local al que se mudó el equipo no es un local flojo, y mezclarlos era ' +
        'la forma más rápida de castigar a quien abrió un punto.</p>' +
        '</div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Localidades con brecha: <span class="dato">' + F().entero(g.brechas.length) + '</span></li>' +
        '<li>Umbral: <span class="dato">' + F().decimal(cb.ratio_minimo, 1) + 'x</span></li>' +
        (primera
          ? '<li>La mayor: <span class="dato">' + global.Datos.localidad(primera.localidad) + '</span> (' +
            F().decimal(primera.ratio, 2) + 'x)</li>'
          : '') +
        '<li>Total en juego: <span class="dato">' + F().entero(Math.round(g.oportunidadBrechas)) + '</span> ops</li>' +
        '</ul></div>'
      );
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
