/* §7.1 Resumen del año — láminas 1 a 3. */
(function (global) {
  'use strict';

  const SECCION = 'Resumen del año';

  function F() {
    return global.Formato;
  }

  /* Indicadores que usan dos láminas: se calculan una vez acá. */
  function indicadores(ctx) {
    const totales = ctx.totales();
    const meses = ctx.periodos.length;
    const metricas = ctx.metricasCajeros();
    const conteo = ctx.conteoCategorias();
    const conCategoria = conteo.alta + conteo.media + conteo.baja;
    const dotacion = ctx.dotacion();
    const todosLosMeses = metricas.filter(function (m) {
      return m.mesesHabilitado > 0 && m.mesesActivos >= m.mesesHabilitado;
    }).length;
    const localesConOps = ctx.porLocal().size;

    return {
      ops: totales.ops,
      meses: meses,
      promedioMensual: meses ? totales.ops / meses : 0,
      locales: localesConOps,
      localesRed: ctx.localesVisibles.length,
      dotacion: dotacion,
      cajeros: metricas.length,
      conCategoria: conCategoria,
      porcentajeAlta: conCategoria ? (conteo.alta / conCategoria) * 100 : null,
      porcentajeTodosLosMeses: metricas.length ? (todosLosMeses / metricas.length) * 100 : 0,
      conteo: conteo,
      metricas: metricas
    };
  }

  function comparativo() {
    if (!global.Datos.hay('anio_anterior')) return null;
    return global.Filtros.motor.comparativoAnual(global.Filtros.estado);
  }

  // ------------------------------------------------------------ Lámina 1

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Portada',
    subtitulo: 'Apertura de la reunión: qué período se analiza, con qué corte de datos y para qué nos juntamos.',
    render: function (host, ctx) {
      const config = global.Datos.config;
      const meta = global.Datos.raw.meta;
      const ind = indicadores(ctx);

      const caja = UI.elemento('div', 'portada');

      const rotulo = UI.elemento('div', 'portada-rotulo');
      rotulo.textContent = config.presentacion.subtitulo;
      caja.appendChild(rotulo);

      const titulo = UI.elemento('h2', 'portada-titulo');
      titulo.innerHTML = config.presentacion.titulo.replace(/(\S+)$/, '<span style="color:var(--amarillo)">$1</span>');
      caja.appendChild(titulo);

      const periodo = UI.elemento('div', 'portada-periodo');
      periodo.textContent = F().capitalizar(F().rangoPeriodos(ctx.periodos));
      caja.appendChild(periodo);

      const objetivo = UI.elemento('p', 'portada-objetivo');
      objetivo.textContent = config.presentacion.objetivo_reunion;
      caja.appendChild(objetivo);

      const datos = UI.tarjetas(
        [
          { rotulo: 'Operaciones del período', valor: F().entero(ind.ops) },
          { rotulo: 'Locales con actividad', valor: F().entero(ind.locales) },
          {
            rotulo: 'Operadores por mes',
            valor: F().entero(Math.round(ind.dotacion.activosPromedio)),
            detalle: 'promedio del período'
          },
          { rotulo: 'Datos al', valor: meta.fecha_corte, chico: true }
        ],
        4
      );
      datos.classList.add('portada-datos');
      caja.appendChild(datos);

      host.appendChild(caja);
    },
    notas: function (ctx) {
      const ind = indicadores(ctx);
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Vamos a recorrer cómo evolucionó la red durante el año: cuánto operamos, ' +
        'cómo se movió la actividad de los cajeros y dónde están las oportunidades por zona. ' +
        'Al final, cada participante recibe el detalle de su zona."</div></div>' +
        '<div class="bloque"><h4>Concepto clave</h4>' +
        '<p>Todas las cifras son de la red completa y del período por defecto: no hay filtros que cambien ' +
        'lo que se ve, así que lo que se proyecta es lo mismo que mira cada jefe zonal después.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Período: <span class="dato">' + F().capitalizar(F().rangoPeriodos(ctx.periodos)) + '</span></li>' +
        '<li>Operaciones: <span class="dato">' + F().entero(ind.ops) + '</span></li>' +
        '<li>Corte de datos: <span class="dato">' + global.Datos.raw.meta.fecha_corte + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // ------------------------------------------------------------ Lámina 2

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Indicadores del año',
    subtitulo: 'Los ocho números que resumen el período.',
    render: function (host, ctx) {
      const ind = indicadores(ctx);
      const comp = comparativo();
      const variacion = comp ? comp.variacionOps : null;

      const linea = ctx.vacio
        ? 'No hay operaciones para mostrar.'
        : 'La red registró <strong>' + F().entero(ind.ops) + '</strong> operaciones en ' +
        ind.meses + (ind.meses === 1 ? ' mes' : ' meses') +
        (variacion !== null ? ', <strong>' + F().variacion(variacion) + '</strong> contra el mismo período del año anterior' : '') +
        ', con <strong>' + F().entero(Math.round(ind.dotacion.activosPromedio)) + '</strong> operadores distintos por mes ' +
        'y <strong>' + F().entero(ind.dotacion.cajerosDistintos) + '</strong> en todo el período.';

      const cuerpo = UI.cabecera(host, this, linea);
      if (ctx.vacio) {
        cuerpo.appendChild(UI.vacio('Sin datos para este recorte', 'No hay operaciones en el período.'));
        return;
      }

      const tarjetas = [
        {
          rotulo: 'Operaciones acumuladas',
          valor: F().entero(ind.ops),
          variacion: variacion,
          textoVariacion: variacion !== null ? 'interanual' : ''
        },
        { rotulo: 'Promedio mensual', valor: F().entero(Math.round(ind.promedioMensual)), detalle: 'sobre ' + ind.meses + ' meses' },
        { rotulo: 'Locales con actividad', valor: F().entero(ind.locales), detalle: 'de ' + F().entero(ind.localesRed) + ' en el recorte' },
        {
          rotulo: 'Operadores por mes',
          valor: F().entero(Math.round(ind.dotacion.activosPromedio)),
          detalle: 'promedio de legajos distintos que operaron'
        },
        {
          rotulo: 'Operadores del período',
          valor: F().entero(ind.dotacion.cajerosDistintos),
          detalle: 'distintos entre ' + F().mesCorto(ctx.periodos[0]) + ' y ' + F().mesCorto(ctx.periodos[ctx.periodos.length - 1])
        },
        /* Con altas y bajas inferidas de la actividad, "sin actividad" mide un
           artefacto: se muestra el rango real de operadores en su lugar. */
        global.Datos.dotacionInferida()
          ? {
            rotulo: 'Mes de menor actividad',
            valor: F().entero(Math.min.apply(null, ctx.porMes().map((m) => m.cajerosConActividad))),
            detalle: 'operadores del mes con menos actividad'
          }
          : {
            rotulo: global.Datos.etiquetaInactivos(),
            valor: F().entero(Math.round(ind.dotacion.inactivosPromedio)),
            detalle: F().porcentaje(ind.dotacion.porcentajeInactivos) + ' de habilitados que no operaron'
          },
        {
          rotulo: '% en productividad alta',
          valor: ind.porcentajeAlta === null ? '—' : F().porcentaje(ind.porcentajeAlta),
          detalle: F().entero(ind.conteo.alta) + ' de ' + F().entero(ind.conCategoria) + ' con datos suficientes'
        },
        {
          rotulo: '% que operó todos los meses',
          valor: F().porcentaje(ind.porcentajeTodosLosMeses),
          detalle: 'sobre los meses en que estuvo habilitado'
        }
      ];

      cuerpo.appendChild(UI.tarjetas(tarjetas, 4));

      // Evolución mensual como referencia visual de las tarjetas.
      const panel = UI.panel('Operaciones por mes', 'el mismo recorte que las tarjetas');
      panel.style.flexGrow = '1';
      const caja = UI.grafico(panel);
      cuerpo.appendChild(panel);

      const porMes = ctx.porMes();
      const serie = [global.Graficos.barra('Operaciones', porMes.map((m) => m.ops), global.Datos.color('principal'))];
      if (comp && comp.anterior.ops > 0) {
        const previos = global.Filtros.motor.periodosAnioAnterior(ctx.periodos);
        const ctxPrevio = global.Filtros.motor.contexto(
          Object.assign({}, global.Filtros.estado, {
            periodo: { modo: 'rango', desde: previos[0], hasta: previos[previos.length - 1] }
          })
        );
        const previosPorMes = ctxPrevio.porMes();
        serie.push(
          global.Graficos.linea('Año anterior', previosPorMes.map((m) => m.ops), global.Datos.color('referencia'), {
            lineStyle: { width: 2, type: 'dashed', color: global.Datos.color('referencia') },
            symbolSize: 6
          })
        );
      }

      global.Graficos.crear(caja, {
        legend: { show: serie.length > 1, data: serie.map((s) => s.name) },
        grid: { top: serie.length > 1 ? 26 : 10, left: 8, right: 14, bottom: 4, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            return global.Graficos.tooltipFilas(
              F().capitalizar(F().mes(porMes[params[0].dataIndex].periodo)),
              params.map(function (p) {
                return { nombre: p.seriesName, valor: F().entero(p.value), color: p.color };
              })
            );
          }
        },
        xAxis: global.Graficos.ejeCategorias(porMes.map((m) => F().mesCorto(m.periodo))),
        yAxis: global.Graficos.ejeValores(),
        series: serie
      });
    },
    notas: function (ctx) {
      const ind = indicadores(ctx);
      const comp = comparativo();
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Estos son los ocho números del año. El que más miramos es el porcentaje de cajeros ' +
        'en productividad alta, porque es el que se puede mover con gestión."</div></div>' +
        '<div class="bloque"><h4>Concepto clave</h4>' +
        '<p>El promedio mensual divide por los meses del período, no por los doce del año.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Operaciones: <span class="dato">' + F().entero(ind.ops) + '</span></li>' +
        (comp && comp.variacionOps !== null
          ? '<li>Interanual: <span class="dato">' + F().variacion(comp.variacionOps) + '</span></li>'
          : '<li>Sin año anterior cargado: la variación interanual no se muestra.</li>') +
        '<li>Operadores por mes: <span class="dato">' + F().entero(Math.round(ind.dotacion.activosPromedio)) +
        '</span> · en todo el período: <span class="dato">' + F().entero(ind.dotacion.cajerosDistintos) + '</span></li>' +
        (global.Datos.dotacionInferida()
          ? '<li>La dotación habilitada no es un dato propio: se infiere de la actividad, así que el número ' +
          'auditable es el de operadores.</li>'
          : '') +
        '<li>Cajeros con datos suficientes: <span class="dato">' + F().entero(ind.conCategoria) + '</span> de ' + F().entero(ind.cajeros) + '</li>' +
        '<li>Operaron todos los meses: <span class="dato">' + F().porcentaje(ind.porcentajeTodosLosMeses) + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // ------------------------------------------------- Lámina 3 (los grupos)

  /* Los tres grupos lado a lado, cada uno con su propia escala: las cantidades
     se llevan tres órdenes de magnitud, así que una pila o un eje compartido
     dejaría a TEC invisible. */
  // ------------------------------------------------------------ Lámina 4

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Mapa de calor anual',
    subtitulo: 'Operaciones por mes y jefe zonal.',
    render: function (host, ctx) {
      const Datos = global.Datos;
      const jefes = Array.from(ctx.porJefe().keys()).sort(function (a, b) {
        return Datos.jefe(a).localeCompare(Datos.jefe(b), 'es');
      });
      const meses = ctx.periodos;

      if (ctx.vacio || !jefes.length) {
        const cuerpoVacio = UI.cabecera(host, this, 'No hay operaciones con los filtros seleccionados.');
        cuerpoVacio.appendChild(UI.vacio('Sin datos para este recorte', 'Ninguna operación cumple con todos los filtros activos.'));
        return;
      }

      // valor[jefe][mes]
      const valores = new Map();
      jefes.forEach(function (j) {
        valores.set(j, new Map());
      });
      ctx.agrupar(function (f) {
        const local = Datos.raw.tx.local[f];
        return Datos.raw.dim.locales.jefe[local] + '|' + Datos.raw.tx.periodo[f];
      }).forEach(function (agg, clave) {
        const partes = clave.split('|');
        const jefe = +partes[0];
        if (valores.has(jefe)) valores.get(jefe).set(+partes[1], agg.ops);
      });

      let valoresPrevios = null;
      if (Datos.hay('anio_anterior')) {
        const previos = global.Filtros.motor.periodosAnioAnterior(meses);
        if (previos && previos.length) {
          const ctxPrevio = global.Filtros.motor.contexto(
            Object.assign({}, global.Filtros.estado, {
              periodo: { modo: 'rango', desde: previos[0], hasta: previos[previos.length - 1] }
            })
          );
          valoresPrevios = new Map();
          jefes.forEach(function (j) {
            valoresPrevios.set(j, new Map());
          });
          ctxPrevio.agrupar(function (f) {
            const local = Datos.raw.tx.local[f];
            return Datos.raw.dim.locales.jefe[local] + '|' + Datos.raw.tx.periodo[f];
          }).forEach(function (agg, clave) {
            const partes = clave.split('|');
            const jefe = +partes[0];
            if (valoresPrevios.has(jefe)) valoresPrevios.get(jefe).set(+partes[1] + 100, agg.ops);
          });
        }
      }

      const mejor = jefes
        .map(function (j) {
          let total = 0;
          valores.get(j).forEach((v) => (total += v));
          return { jefe: j, total: total };
        })
        .sort((a, b) => b.total - a.total)[0];

      const linea =
        'El mapa muestra las <strong>' + F().entero(ctx.totales().ops) + '</strong> operaciones del período repartidas por mes y jefe zonal; ' +
        'la zona de <strong>' + Datos.jefe(mejor.jefe) + '</strong> concentra el ' +
        F().porcentaje((mejor.total / ctx.totales().ops) * 100) + ' del total.';

      const cuerpo = UI.cabecera(host, this, linea);
      const panel = UI.panel('Operaciones por mes y jefe zonal', 'cuanto más claro, más operaciones');
      panel.style.flexGrow = '1';

      let modo = 'volumen';
      if (valoresPrevios) {
        const boton = UI.elemento('button', 'boton boton-chico no-imprimir', 'Ver variación interanual');
        boton.onclick = function () {
          modo = modo === 'volumen' ? 'variacion' : 'volumen';
          boton.textContent = modo === 'volumen' ? 'Ver variación interanual' : 'Ver volumen';
          pintar();
        };
        panel.querySelector('.panel-titulo').appendChild(boton);
      }

      const caja = UI.grafico(panel);
      cuerpo.appendChild(panel);

      function pintar() {
        const datos = [];
        let maximo = 0;
        let limite = 0;
        jefes.forEach(function (jefe, fila) {
          meses.forEach(function (mes, columna) {
            const actual = valores.get(jefe).get(mes) || 0;
            if (modo === 'volumen') {
              maximo = Math.max(maximo, actual);
              datos.push([columna, fila, actual]);
            } else {
              const previo = valoresPrevios.get(jefe).get(mes) || 0;
              const variacion = previo > 0 ? ((actual - previo) / previo) * 100 : null;
              if (variacion !== null) limite = Math.max(limite, Math.abs(variacion));
              datos.push([columna, fila, variacion === null ? '-' : +variacion.toFixed(1)]);
            }
          });
        });
        limite = Math.min(Math.max(limite, 10), 120);

        const instancia = global.Graficos.reemplazar(caja, {
          grid: { left: 8, right: 60, top: 24, bottom: 4, containLabel: true },
          tooltip: {
            formatter: function (p) {
              const jefe = jefes[p.data[1]];
              const mes = meses[p.data[0]];
              const actual = valores.get(jefe).get(mes) || 0;
              const filas = [{ nombre: 'Operaciones', valor: F().entero(actual) }];
              if (valoresPrevios) {
                const previo = valoresPrevios.get(jefe).get(mes) || 0;
                filas.push({ nombre: 'Año anterior', valor: F().entero(previo) });
                filas.push({
                  nombre: 'Variación',
                  valor: previo > 0 ? F().variacion(((actual - previo) / previo) * 100) : 'sin base'
                });
              }
              return global.Graficos.tooltipFilas(
                Datos.jefe(jefe) + ' · ' + F().capitalizar(F().mes(mes)),
                filas
              );
            }
          },
          xAxis: global.Graficos.ejeCategorias(meses.map((m) => F().mesCorto(m)), { splitArea: { show: false } }),
          yAxis: global.Graficos.ejeCategorias(jefes.map((j) => Datos.jefe(j)), {
            axisLabel: { color: Graficos.colorTexto, fontSize: Graficos.fuenteChica, width: 120, overflow: 'truncate' }
          }),
          visualMap:
            modo === 'volumen'
              ? global.Graficos.visualMapCalor(0, maximo || 1, Datos.config, { orient: 'vertical', right: 0, top: 'middle' })
              : global.Graficos.visualMapDivergente(limite, Datos.config, { orient: 'vertical', right: 0, top: 'middle' }),
          series: [
            {
              type: 'heatmap',
              data: datos,
              itemStyle: { borderColor: '#0f121d', borderWidth: 1.5, borderRadius: 3 },
              emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } },
              label: {
                show: meses.length <= 13,
                fontSize: Graficos.fuenteChica,
                color: '#0b0d14',
                fontWeight: 600,
                formatter: function (p) {
                  if (p.data[2] === '-') return '';
                  return modo === 'volumen' ? F().compacto(p.data[2]) : F().variacion(p.data[2], 0);
                }
              }
            }
          ]
        });
        caja._instancia = instancia;
        instancia.on('click', function (p) {
          if (p.data && p.data[1] !== undefined) global.Filtros.alternar('jefes', jefes[p.data[1]]);
        });
      }

      pintar();
    },
    notas: function (ctx) {
      const Datos = global.Datos;
      const porJefe = Array.from(ctx.porJefe().entries()).sort((a, b) => b[1].ops - a[1].ops);
      const total = ctx.totales().ops;
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Cada fila es una zona y cada columna un mes. Lo que buscamos no es el número exacto ' +
        'sino la franja clara o la franja oscura: dónde se cortó el ritmo y en qué mes."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>En modo volumen, más claro es más operaciones. En variación interanual, verde es crecimiento y rojo caída ' +
        'contra el mismo mes del año pasado; el gris del medio es "sin cambios".</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        porJefe.slice(0, 4).map(function (e) {
          return '<li>' + Datos.jefe(e[0]) + ': <span class="dato">' + F().entero(e[1].ops) + '</span> (' +
            F().porcentaje((e[1].ops / total) * 100) + ')</li>';
        }).join('') +
        '</ul></div>'
      );
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
