/* §7.4 Actividad del año — láminas 14 a 20 (la de montos se sacó: la
   presentación habla solo de transacciones). */
(function (global) {
  'use strict';

  const SECCION = 'Actividad del año';

  function F() {
    return global.Formato;
  }

  function vacio(host, lamina, detalle) {
    const cuerpo = UI.cabecera(host, lamina, 'No hay operaciones para mostrar.');
    cuerpo.appendChild(UI.vacio('Sin datos para este recorte', detalle || 'No hay operaciones en el período.'));
  }

  function jefeDe(local) {
    return local >= 0 ? global.Datos.raw.dim.locales.jefe[local] : -1;
  }

  // ----------------------------------------------------------- Lámina 14

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Operadores por mes',
    subtitulo: 'Cuántos legajos distintos operaron cada mes y cuántos dejaron de hacerlo.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const porMes = ctx.porMes();
      const dotacion = ctx.dotacion();
      const inferida = Datos.dotacionInferida();
      const maximo = porMes.slice().sort((a, b) => b.cajerosConActividad - a.cajerosConActividad)[0];
      const minimo = porMes.slice().sort((a, b) => a.cajerosConActividad - b.cajerosConActividad)[0];

      const linea =
        'Operaron <strong>' + F().entero(Math.round(dotacion.activosPromedio)) + '</strong> legajos distintos por mes en promedio, ' +
        'entre <strong>' + F().entero(minimo.cajerosConActividad) + '</strong> en ' + F().mesCorto(minimo.periodo) +
        ' y <strong>' + F().entero(maximo.cajerosConActividad) + '</strong> en ' + F().mesCorto(maximo.periodo) +
        '; en todo el período pasaron <strong>' + F().entero(dotacion.cajerosDistintos) + '</strong>.';

      const cuerpo = UI.cabecera(host, this, linea);

      /* Sin padrón de usuarios, la dotación y la inactividad son circulares: se
         infieren de la misma actividad que después se mide contra ellas. En ese
         caso la lámina muestra solo lo que se puede auditar. */
      const tarjetas = [
        { rotulo: 'Operadores por mes', valor: F().entero(Math.round(dotacion.activosPromedio)), detalle: 'promedio del período' },
        {
          rotulo: 'Operadores del período',
          valor: F().entero(dotacion.cajerosDistintos),
          detalle: 'distintos entre ' + F().mesCorto(ctx.periodos[0]) + ' y ' + F().mesCorto(ctx.periodos[ctx.periodos.length - 1])
        }
      ];
      if (inferida) {
        tarjetas.push(
          { rotulo: 'Mes más alto', valor: F().entero(maximo.cajerosConActividad), detalle: F().capitalizar(F().mes(maximo.periodo)) },
          { rotulo: 'Mes de menor actividad', valor: F().entero(minimo.cajerosConActividad), detalle: F().capitalizar(F().mes(minimo.periodo)) }
        );
      } else {
        tarjetas.push(
          {
            rotulo: Datos.etiquetaInactivos(),
            valor: F().entero(Math.round(dotacion.inactivosPromedio)),
            detalle: F().porcentaje(dotacion.porcentajeInactivos) + ' de la dotación'
          },
          {
            rotulo: Datos.etiquetaHabilitados(),
            valor: F().entero(Math.round(dotacion.habilitadosPromedio)),
            detalle: 'promedio mensual'
          }
        );
      }
      cuerpo.appendChild(UI.tarjetas(tarjetas, 4));

      const fila = UI.fila(true);

      const panel = UI.panel(
        'Operadores por mes',
        inferida ? 'legajos distintos que operaron cada mes' : 'habilitados, separados entre los que operaron y los que no'
      );
      panel.style.flex = '1.2 1 0';
      const caja = UI.grafico(panel);
      fila.appendChild(panel);

      const panelJefe = UI.panel(
        inferida ? 'Operadores por zona' : Datos.etiquetaInactivos() + ' por jefe zonal',
        'promedio del período'
      );
      panelJefe.style.flex = '1 1 0';
      const cajaJefe = UI.grafico(panelJefe);
      fila.appendChild(panelJefe);

      cuerpo.appendChild(fila);

      global.Graficos.crear(caja, {
        legend: { show: !inferida, data: ['Operaron', Datos.etiquetaInactivos()] },
        grid: { left: 8, right: 14, top: 30, bottom: 4, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            const m = porMes[params[0].dataIndex];
            const filasTooltip = [
              { nombre: 'Operaron', valor: F().entero(m.cajerosConActividad), color: Datos.color('positivo') }
            ];
            if (!inferida) {
              filasTooltip.push(
                { nombre: Datos.etiquetaInactivos(), valor: F().entero(m.cajerosInactivos), color: Datos.color('negativo') },
                { nombre: Datos.etiquetaHabilitados(), valor: F().entero(m.cajerosHabilitados) }
              );
            }
            filasTooltip.push({ nombre: 'Operaron en este recorte', valor: F().entero(m.cajerosActivos) });
            return global.Graficos.tooltipFilas(F().capitalizar(F().mes(m.periodo)), filasTooltip);
          }
        },
        xAxis: global.Graficos.ejeCategorias(ctx.periodos.map((p) => F().mesCorto(p))),
        yAxis: global.Graficos.ejeValores(),
        series: inferida
          ? [global.Graficos.barra('Operaron', porMes.map((m) => m.cajerosConActividad), Datos.color('positivo'))]
          : [
            global.Graficos.barraApilada('Operaron', porMes.map((m) => m.cajerosConActividad), Datos.color('positivo')),
            global.Graficos.barraApilada(Datos.etiquetaInactivos(), porMes.map((m) => m.cajerosInactivos), Datos.color('negativo'))
          ]
      });

      // Por zona: se recalcula el contexto de cada jefe, porque la dotación
      // depende de qué locales entran en el recorte.
      const jefes = Array.from(ctx.porJefe().keys());
      const porJefe = jefes.map(function (j) {
        const ctxJefe = global.Filtros.motor.contexto(Object.assign({}, global.Filtros.estado, { jefes: [j] }));
        const d = ctxJefe.dotacion();
        return {
          jefe: j,
          nombre: Datos.jefe(j),
          porcentaje: d.porcentajeInactivos,
          inactivos: d.inactivosPromedio,
          habilitados: d.habilitadosPromedio,
          operadores: d.activosPromedio,
          distintos: d.cajerosDistintos
        };
      }).sort(function (a, b) {
        return inferida ? b.operadores - a.operadores : b.porcentaje - a.porcentaje;
      });

      const orden = porJefe.slice().reverse();
      const instancia = global.Graficos.crear(cajaJefe, {
        grid: { left: 8, right: 44, top: 12, bottom: 4, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            const f = orden[params[0].dataIndex];
            return global.Graficos.tooltipFilas(
              f.nombre,
              inferida
                ? [
                  { nombre: 'Operadores por mes', valor: F().entero(Math.round(f.operadores)) },
                  { nombre: 'Operadores del período', valor: F().entero(f.distintos) }
                ]
                : [
                  { nombre: Datos.etiquetaHabilitados(), valor: F().entero(Math.round(f.habilitados)) },
                  { nombre: Datos.etiquetaInactivos(), valor: F().entero(Math.round(f.inactivos)) },
                  { nombre: 'Porcentaje', valor: F().porcentaje(f.porcentaje) }
                ]
            );
          }
        },
        xAxis: global.Graficos.ejeValores(
          inferida
            ? {}
            : { axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, formatter: (v) => v + '%' } }
        ),
        yAxis: global.Graficos.ejeCategorias(orden.map((f) => f.nombre), {
          axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, width: 110, overflow: 'truncate' }
        }),
        series: [
          inferida
            ? global.Graficos.barraHorizontal('Operadores', orden.map((f) => Math.round(f.operadores)), Datos.color('principal'), {
              label: global.Graficos.etiqueta((p) => F().entero(p.value), 'right')
            })
            : global.Graficos.barraHorizontal(Datos.etiquetaInactivos(), orden.map((f) => +f.porcentaje.toFixed(1)), Datos.color('negativo'), {
              label: global.Graficos.etiqueta((p) => F().porcentaje(p.value), 'right'),
              markLine: global.Graficos.referenciaX(+dotacion.porcentajeInactivos.toFixed(1), 'Red ' + F().porcentaje(dotacion.porcentajeInactivos))
            })
        ]
      });
      instancia.on('click', function (p) {
        global.Filtros.alternar('jefes', orden[p.dataIndex].jefe);
      });
    },
    notas: function (ctx) {
      const dotacion = ctx.dotacion();
      const porMes = ctx.porMes();
      const inferida = global.Datos.dotacionInferida();
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Cuánta gente movió el mostrador cada mes. Es el número que se cruza con el ' +
        'volumen: si las operaciones suben y los operadores bajan, cada uno está haciendo más."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>Un operador cuenta en el mes si hizo al menos una operación, <em>en cualquier local, zona o grupo</em>. ' +
        'Por eso el número no cambia de significado al filtrar: filtrar cambia a quiénes se mira, no qué es operar.</p>' +
        (inferida
          ? '<p><strong>Por qué no hay dotación ni inactividad acá:</strong> los datos no traen padrón de ' +
          'usuarios, así que el alta y la baja se infieren de la primera y la última operación de cada legajo ' +
          '(D-08). Medir "habilitados que no operaron" contra una habilitación deducida de la propia actividad ' +
          'es circular, así que esa cifra se sacó. Lo que queda —operadores por mes— coincide exactamente con ' +
          'la fuente. Si algún día entra el padrón real, la lámina vuelve sola a mostrar dotación e inactividad.</p>'
          : '<p>La barra roja es la gente con usuario vigente que no operó ese mes.</p>') +
        '</div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Operadores por mes: <span class="dato">' + F().entero(Math.round(dotacion.activosPromedio)) + '</span></li>' +
        '<li>Último mes del período: <span class="dato">' +
        F().entero(porMes.length ? porMes[porMes.length - 1].cajerosConActividad : 0) + '</span></li>' +
        '<li>Distintos en todo el período: <span class="dato">' + F().entero(dotacion.cajerosDistintos) + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // ----------------------------------------------------------- Lámina 19

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Rechazos',
    subtitulo: 'Operaciones rechazadas, canceladas o revertidas, por zona y por mes.',
    requiere: 'rechazos',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const totales = ctx.totales();
      const tasaRed = totales.ops > 0 ? (totales.rechazadas / totales.ops) * 100 : 0;
      const porMes = ctx.porMes();

      const porJefe = Array.from(ctx.porJefe().entries())
        .map(function (e) {
          return {
            jefe: e[0],
            nombre: Datos.jefe(e[0]),
            ops: e[1].ops,
            rechazadas: e[1].rechazadas,
            tasa: e[1].ops > 0 ? (e[1].rechazadas / e[1].ops) * 100 : 0
          };
        })
        .sort((a, b) => a.tasa - b.tasa);

      const peor = porJefe[porJefe.length - 1];
      const linea =
        'La red rechazó <strong>' + F().entero(totales.rechazadas) + '</strong> operaciones, el <strong>' +
        F().porcentaje(tasaRed, 2) + '</strong> del total; la tasa más alta es la de <strong>' + peor.nombre +
        '</strong> (' + F().porcentaje(peor.tasa, 2) + ').';

      const cuerpo = UI.cabecera(host, this, linea);
      const fila = UI.fila(true);

      const panelJefe = UI.panel('Tasa de rechazo por zona', 'línea gris: promedio de la red');
      panelJefe.style.flex = '1 1 0';
      const cajaJefe = UI.grafico(panelJefe);
      fila.appendChild(panelJefe);

      const panelMes = UI.panel('Rechazos por mes', 'barras: cantidad · línea: tasa');
      panelMes.style.flex = '1 1 0';
      const cajaMes = UI.grafico(panelMes);
      fila.appendChild(panelMes);

      cuerpo.appendChild(fila);

      const instancia = global.Graficos.crear(cajaJefe, {
        grid: { left: 8, right: 50, top: 12, bottom: 4, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            const f = porJefe[params[0].dataIndex];
            return global.Graficos.tooltipFilas(f.nombre, [
              { nombre: 'Operaciones', valor: F().entero(f.ops) },
              { nombre: 'Rechazadas', valor: F().entero(f.rechazadas) },
              { nombre: 'Tasa', valor: F().porcentaje(f.tasa, 2) }
            ]);
          }
        },
        xAxis: global.Graficos.ejeValores({ axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, formatter: (v) => v + '%' } }),
        yAxis: global.Graficos.ejeCategorias(porJefe.map((f) => f.nombre), {
          axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, width: 110, overflow: 'truncate' }
        }),
        series: [
          global.Graficos.barraHorizontal('Tasa de rechazo', porJefe.map((f) => +f.tasa.toFixed(2)), Datos.color('negativo'), {
            label: global.Graficos.etiqueta((p) => F().porcentaje(p.value, 2), 'right'),
            markLine: global.Graficos.referenciaX(+tasaRed.toFixed(2), 'Red')
          })
        ]
      });
      instancia.on('click', function (p) {
        global.Filtros.alternar('jefes', porJefe[p.dataIndex].jefe);
      });

      const tasas = porMes.map((m) => (m.ops > 0 ? +((m.rechazadas / m.ops) * 100).toFixed(2) : 0));
      global.Graficos.crear(cajaMes, {
        legend: { data: ['Rechazadas', 'Tasa'] },
        grid: { left: 8, right: 8, top: 30, bottom: 4, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            const m = porMes[params[0].dataIndex];
            return global.Graficos.tooltipFilas(F().capitalizar(F().mes(m.periodo)), [
              { nombre: 'Operaciones', valor: F().entero(m.ops) },
              { nombre: 'Rechazadas', valor: F().entero(m.rechazadas) },
              { nombre: 'Tasa', valor: F().porcentaje(m.ops > 0 ? (m.rechazadas / m.ops) * 100 : 0, 2) }
            ]);
          }
        },
        xAxis: global.Graficos.ejeCategorias(ctx.periodos.map((p) => F().mesCorto(p))),
        yAxis: [
          global.Graficos.ejeValores(),
          global.Graficos.ejeValores({
            position: 'right',
            splitLine: { show: false },
            axisLabel: { color: Datos.color('negativo'), fontSize: global.Graficos.fuenteChica, formatter: (v) => v + '%' }
          })
        ],
        series: [
          global.Graficos.barra('Rechazadas', porMes.map((m) => m.rechazadas), Datos.color('referencia')),
          global.Graficos.linea('Tasa', tasas, Datos.color('negativo'), { yAxisIndex: 1 })
        ]
      });
    },
    notas: function (ctx) {
      const totales = ctx.totales();
      const tasa = totales.ops > 0 ? (totales.rechazadas / totales.ops) * 100 : 0;
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Los rechazos no son solo un problema de calidad: son trabajo hecho dos veces. ' +
        'Una tasa alta en una zona suele ser un tema de capacitación puntual."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>La tasa es rechazadas sobre el total de operaciones del mismo recorte. ' +
        'Las barras del gráfico de la derecha son cantidad y la línea, la tasa: una zona chica puede tener ' +
        'pocos rechazos y mala tasa.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Rechazadas: <span class="dato">' + F().entero(totales.rechazadas) + '</span></li>' +
        '<li>Tasa de la red: <span class="dato">' + F().porcentaje(tasa, 2) + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // ----------------------------------------------------------- Lámina 20

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Día y franja horaria',
    subtitulo: 'Cuándo opera la red: días de la semana contra horas del día.',
    requiere: 'horaria',
    render: function (host, ctx) {
      const Datos = global.Datos;
      const horaria = Datos.raw.horaria;
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const localesVisibles = new Set(ctx.localesVisibles);
      const enPeriodo = new Set(ctx.periodos);

      const matriz = [];
      for (let d = 0; d < 7; d++) matriz.push(new Array(24).fill(0));
      let total = 0;
      for (let i = 0; i < horaria.periodo.length; i++) {
        if (!enPeriodo.has(horaria.periodo[i])) continue;
        if (!localesVisibles.has(horaria.local[i])) continue;
        const d = horaria.dia[i] - 1;
        const h = horaria.hora[i];
        if (d < 0 || d > 6 || h < 0 || h > 23) continue;
        matriz[d][h] += horaria.cantidad[i];
        total += horaria.cantidad[i];
      }

      if (!total) return vacio(host, this, 'No hay actividad horaria para este recorte.');

      let mejorDia = 0;
      let mejorHora = 0;
      let maximo = 0;
      const datos = [];
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          datos.push([h, d, matriz[d][h]]);
          if (matriz[d][h] > maximo) {
            maximo = matriz[d][h];
            mejorDia = d;
            mejorHora = h;
          }
        }
      }

      const porDia = matriz.map((fila) => fila.reduce((a, b) => a + b, 0));
      const diaFuerte = porDia.indexOf(Math.max.apply(null, porDia));

      const linea =
        'El pico está los <strong>' + dias[mejorDia].toLowerCase() + '</strong> entre las <strong>' + mejorHora +
        ' y las ' + (mejorHora + 1) + '</strong>; el día de mayor volumen es el <strong>' + dias[diaFuerte].toLowerCase() +
        '</strong>, con ' + F().porcentaje((porDia[diaFuerte] / total) * 100) + ' de las operaciones de la semana.';

      const cuerpo = UI.cabecera(host, this, linea);
      const panel = UI.panel('Operaciones por día y hora', F().entero(total) + ' operaciones con dato horario');
      panel.style.flexGrow = '1';
      const caja = UI.grafico(panel);
      cuerpo.appendChild(panel);

      global.Graficos.crear(caja, {
        grid: { left: 8, right: 70, top: 12, bottom: 4, containLabel: true },
        tooltip: {
          formatter: function (p) {
            return global.Graficos.tooltipFilas(dias[p.data[1]] + ' · ' + p.data[0] + ' a ' + (p.data[0] + 1) + ' h', [
              { nombre: 'Operaciones', valor: F().entero(p.data[2]) },
              { nombre: '% de la semana', valor: F().porcentaje((p.data[2] / total) * 100) }
            ]);
          }
        },
        xAxis: global.Graficos.ejeCategorias(
          Array.from({ length: 24 }, (_, h) => String(h)),
          { axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, interval: 1 } }
        ),
        yAxis: global.Graficos.ejeCategorias(dias),
        visualMap: global.Graficos.visualMapCalor(0, maximo || 1, Datos.config, { orient: 'vertical', right: 0, top: 'middle' }),
        series: [
          {
            type: 'heatmap',
            data: datos,
            itemStyle: { borderColor: '#0f121d', borderWidth: 1, borderRadius: 2 },
            emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } }
          }
        ]
      });
    },
    notas: function () {
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Saber cuándo se concentra la demanda es lo que permite discutir turnos y ' +
        'refuerzos con un dato en la mano."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>Cada celda es un día de la semana y una hora. Más claro, más operaciones. ' +
        'Respeta los filtros de período, zona y local.</p></div>'
      );
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
