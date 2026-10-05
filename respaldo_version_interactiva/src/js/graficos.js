/* Capa sobre ECharts: tema oscuro, defaults compartidos y ciclo de vida de las
   instancias (una lámina que se va tiene que soltar sus gráficos).

   Reglas que vienen de la skill dataviz y no se negocian por gráfico:
   - la paleta categórica se asigna en orden fijo, nunca ciclada por ranking;
   - marcas finas, grilla discreta, tooltip siempre;
   - con 2 o más series hay leyenda; el color nunca es la única señal. */
(function (global) {
  'use strict';

  const instancias = [];
  let escala = 1; // sube en modo proyección

  const Graficos = {
    get fuente() {
      return Math.round(13 * escala);
    },

    get fuenteChica() {
      return Math.round(11.5 * escala);
    },

    setEscala: function (valor) {
      escala = valor;
    },

    colorTexto: '#94a3b8',
    colorTextoFuerte: '#e2e8f0',
    colorGrilla: 'rgba(148,163,184,0.13)',
    colorLinea: 'rgba(148,163,184,0.35)',
    colorFondoTooltip: 'rgba(10,13,22,0.96)',

    /* Crea la instancia y la deja registrada para poder soltarla después. */
    crear: function (contenedor, opcion) {
      if (!contenedor) return null;
      const instancia = global.echarts.init(contenedor, null, { renderer: 'canvas' });
      instancia.setOption(Graficos.conDefaults(opcion));
      instancias.push(instancia);
      return instancia;
    },

    /* Vuelve a dibujar sobre el mismo contenedor soltando lo que hubiera antes.
       Es lo que usan los botones que alternan la métrica de un gráfico. */
    reemplazar: function (contenedor, opcion) {
      if (!contenedor) return null;
      const previa = global.echarts.getInstanceByDom(contenedor);
      if (previa) {
        const posicion = instancias.indexOf(previa);
        if (posicion >= 0) instancias.splice(posicion, 1);
        previa.dispose();
      }
      return Graficos.crear(contenedor, opcion);
    },

    /* Se llama antes de pintar otra lámina: si no, quedan instancias colgadas
       escuchando resize sobre nodos que ya no están en el documento. */
    limpiar: function () {
      while (instancias.length) {
        const i = instancias.pop();
        try {
          i.dispose();
        } catch (e) {
          /* el contenedor ya no existe */
        }
      }
    },

    /* La impresión crea instancias propias: se marca antes y se sueltan solo
       esas, para no llevarse puestas las de la lámina que está en pantalla. */
    marcar: function () {
      return instancias.length;
    },

    limpiarDesde: function (indice) {
      while (instancias.length > indice) {
        const i = instancias.pop();
        try {
          i.dispose();
        } catch (e) {
          /* el contenedor ya no existe */
        }
      }
    },

    redimensionar: function () {
      instancias.forEach(function (i) {
        try {
          i.resize();
        } catch (e) {
          /* ignorar */
        }
      });
    },

    conDefaults: function (opcion) {
      const base = {
        animationDuration: 400,
        textStyle: { fontFamily: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif', fontSize: Graficos.fuente },
        grid: { left: 8, right: 14, top: 26, bottom: 6, containLabel: true },
        tooltip: {
          backgroundColor: Graficos.colorFondoTooltip,
          borderColor: 'rgba(148,163,184,0.25)',
          borderWidth: 1,
          textStyle: { color: Graficos.colorTextoFuerte, fontSize: Graficos.fuente },
          padding: [8, 11],
          confine: true
        },
        legend: {
          type: 'scroll',
          top: 0,
          itemWidth: 11,
          itemHeight: 11,
          itemGap: 12,
          textStyle: { color: Graficos.colorTexto, fontSize: Graficos.fuenteChica },
          pageTextStyle: { color: Graficos.colorTexto },
          pageIconColor: '#ffcc00',
          pageIconInactiveColor: '#4b5563'
        }
      };
      return Graficos.fusionar(base, opcion);
    },

    fusionar: function (destino, origen) {
      const salida = Object.assign({}, destino);
      Object.keys(origen || {}).forEach(function (clave) {
        const valor = origen[clave];
        if (valor && typeof valor === 'object' && !Array.isArray(valor) && destino[clave] && typeof destino[clave] === 'object' && !Array.isArray(destino[clave])) {
          salida[clave] = Graficos.fusionar(destino[clave], valor);
        } else {
          salida[clave] = valor;
        }
      });
      return salida;
    },

    // ------------------------------------------------------------ ejes

    ejeCategorias: function (datos, extra) {
      return Graficos.fusionar(
        {
          type: 'category',
          data: datos,
          axisLine: { lineStyle: { color: Graficos.colorLinea } },
          axisTick: { show: false },
          axisLabel: { color: Graficos.colorTexto, fontSize: Graficos.fuenteChica, hideOverlap: true },
          splitLine: { show: false }
        },
        extra || {}
      );
    },

    ejeValores: function (extra) {
      return Graficos.fusionar(
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: Graficos.colorTexto,
            fontSize: Graficos.fuenteChica,
            formatter: function (v) {
              return global.Formato.compacto(v);
            }
          },
          splitLine: { lineStyle: { color: Graficos.colorGrilla, type: 'dashed' } }
        },
        extra || {}
      );
    },

    // --------------------------------------------------------- series

    /* Barras: extremo redondeado de 4 px del lado del dato, apoyado en la base. */
    barra: function (nombre, datos, color, extra) {
      return Graficos.fusionar(
        {
          name: nombre,
          type: 'bar',
          data: datos,
          itemStyle: { color: color, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 34,
          emphasis: { focus: 'series' }
        },
        extra || {}
      );
    },

    barraHorizontal: function (nombre, datos, color, extra) {
      return Graficos.fusionar(
        {
          name: nombre,
          type: 'bar',
          data: datos,
          itemStyle: { color: color, borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 22,
          emphasis: { focus: 'series' }
        },
        extra || {}
      );
    },

    /* En una pila, 2 px de separación entre segmentos: el borde del color del
       fondo es lo que los separa sin inventar un color nuevo. */
    barraApilada: function (nombre, datos, color, pila, extra) {
      return Graficos.fusionar(
        {
          name: nombre,
          type: 'bar',
          stack: pila || 'total',
          data: datos,
          itemStyle: { color: color, borderColor: '#0f121d', borderWidth: 1.5 },
          barMaxWidth: 38,
          emphasis: { focus: 'series' }
        },
        extra || {}
      );
    },

    linea: function (nombre, datos, color, extra) {
      return Graficos.fusionar(
        {
          name: nombre,
          type: 'line',
          data: datos,
          smooth: false,
          symbol: 'circle',
          symbolSize: 8,
          lineStyle: { width: 2, color: color },
          itemStyle: { color: color, borderColor: '#0f121d', borderWidth: 1.5 },
          emphasis: { focus: 'series' }
        },
        extra || {}
      );
    },

    /* Línea de referencia del promedio de la red: gris, punteada, con su rótulo. */
    referencia: function (valor, texto, color) {
      return {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', width: 1.5, color: color || '#94a3b8' },
        label: {
          show: true,
          position: 'insideEndTop',
          color: color || '#94a3b8',
          fontSize: Graficos.fuenteChica,
          formatter: texto
        },
        data: [{ yAxis: valor }]
      };
    },

    referenciaX: function (valor, texto, color) {
      return {
        silent: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', width: 1.5, color: color || '#94a3b8' },
        label: { show: true, position: 'insideEndTop', color: color || '#94a3b8', fontSize: Graficos.fuenteChica, formatter: texto },
        data: [{ xAxis: valor }]
      };
    },

    /* Rampa secuencial de un solo tono para mapas de calor (dataviz: nunca arcoíris). */
    rampa: function (config) {
      return config.colores.rampa_secuencial;
    },

    visualMapCalor: function (min, max, config, extra) {
      return Graficos.fusionar(
        {
          min: min,
          max: max,
          calculable: false,
          orient: 'horizontal',
          right: 4,
          top: 0,
          itemWidth: 11,
          itemHeight: 70,
          textStyle: { color: Graficos.colorTexto, fontSize: Graficos.fuenteChica },
          inRange: { color: Graficos.rampa(config) },
          formatter: function (v) {
            return global.Formato.compacto(v);
          }
        },
        extra || {}
      );
    },

    /* Diverging: dos tonos y gris al medio, nunca un tono en el punto neutro. */
    visualMapDivergente: function (limite, config, extra) {
      return Graficos.fusionar(
        {
          min: -limite,
          max: limite,
          calculable: false,
          orient: 'horizontal',
          right: 4,
          top: 0,
          itemWidth: 11,
          itemHeight: 70,
          textStyle: { color: Graficos.colorTexto, fontSize: Graficos.fuenteChica },
          inRange: { color: [config.colores.series.negativo, '#4b5563', config.colores.series.positivo] },
          formatter: function (v) {
            return global.Formato.variacion(v);
          }
        },
        extra || {}
      );
    },

    /* Etiqueta directa sobre la marca, para las series que la llevan (no todas). */
    etiqueta: function (formateador, posicion) {
      return {
        show: true,
        position: posicion || 'top',
        color: Graficos.colorTextoFuerte,
        fontSize: Graficos.fuenteChica,
        formatter: formateador
      };
    },

    /* Une nombre y valor en el tooltip, que siempre muestra el número exacto. */
    tooltipFilas: function (titulo, filas) {
      const cuerpo = filas
        .map(function (f) {
          const punto = f.color
            ? '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + f.color + ';margin-right:6px"></span>'
            : '';
          return (
            '<div style="display:flex;justify-content:space-between;gap:14px;line-height:1.55">' +
            '<span>' + punto + f.nombre + '</span>' +
            '<strong style="font-variant-numeric:tabular-nums">' + f.valor + '</strong>' +
            '</div>'
          );
        })
        .join('');
      return '<div style="font-weight:700;margin-bottom:5px">' + titulo + '</div>' + cuerpo;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Graficos;
  else global.Graficos = Graficos;
})(typeof globalThis !== 'undefined' ? globalThis : this);
