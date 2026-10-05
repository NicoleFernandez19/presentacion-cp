/* Avances y retrocesos por jefe zonal: el corazón de la reunión.

   Dos reglas de equidad, pedidas por negocio:
   - **Normalizado por tamaño.** Todo lo que se compara entre zonas está dividido
     por operadores o por locales. Una zona de 120 cajeros no compite contra una
     de 74 en volumen absoluto.
   - **Cada zona contra sí misma.** El avance es la variación sobre el propio
     arranque de cada zona, no la distancia contra la mejor. El que arrancó bajo
     puede encabezar el ranking si mejoró.

   La referencia son los primeros meses del período contra los últimos
   (`ventanaComparacion` en metricas.js), no trimestres calendario: así nunca
   quedan afuera los meses más recientes. */
(function (global) {
  'use strict';

  const SECCION = 'Avances y retrocesos';

  function F() {
    return global.Formato;
  }

  function vacio(host, lamina, detalle) {
    const cuerpo = UI.cabecera(host, lamina, 'No hay datos para mostrar.');
    cuerpo.appendChild(UI.vacio('Sin datos para este recorte', detalle || 'No hay operaciones en el período.'));
  }

  function etiquetaVentana(ventana) {
    if (!ventana) return '';
    const texto = function (periodos) {
      return periodos.length === 1
        ? F().mesCorto(periodos[0])
        : F().mesCorto(periodos[0]) + ' a ' + F().mesCorto(periodos[periodos.length - 1]);
    };
    return texto(ventana.inicio) + ' contra ' + texto(ventana.fin);
  }

  function capitalizar(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function nombreDelTotal() {
    return 'la red';
  }

  /* El número y su variación en una misma celda: antes eran dos columnas por
     medida, y las tres de variación se llamaban todas «Avance». */
  function valorConVariacion(valor, variacion) {
    return (
      '<span style="font-weight:600">' + F().entero(valor) + '</span>' +
      '<span class="tenue" style="margin:0 5px">·</span>' +
      '<span style="font-size:0.92em">' + nodoVariacion(variacion) + '</span>'
    );
  }

  /* Filas ordenadas por avance, con el nombre resuelto. */
  function filasAvance(ctx) {
    const Datos = global.Datos;
    const avance = ctx.avancePorJefe();
    const filas = avance.filas
      .map(function (f) {
        return Object.assign(f, { nombre: Datos.jefe(f.jefe) });
      })
      .filter((f) => f.total.ops > 0);
    filas.sort(function (a, b) {
      const va = a.varOpsPorOperador === null || a.varOpsPorOperador === undefined ? -Infinity : a.varOpsPorOperador;
      const vb = b.varOpsPorOperador === null || b.varOpsPorOperador === undefined ? -Infinity : b.varOpsPorOperador;
      return vb - va;
    });
    return { ventana: avance.ventana, filas: filas };
  }

  function nodoVariacion(valor, decimales) {
    if (valor === null || valor === undefined) return '<span class="tenue">—</span>';
    const Datos = global.Datos;
    const color = valor > 0.5 ? Datos.color('positivo') : valor < -0.5 ? Datos.color('negativo') : Datos.color('referencia');
    const flecha = valor > 0.5 ? '▲' : valor < -0.5 ? '▼' : '=';
    return '<span style="color:' + color + ';font-weight:700">' + flecha + ' ' + F().variacion(valor, decimales === undefined ? 1 : decimales) + '</span>';
  }

  // ------------------------------------------------------------ Lámina A

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Tablero de avance por zona',
    subtitulo: 'Cómo se movió cada zona contra su propio arranque, con todo normalizado por tamaño.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const { ventana, filas } = filasAvance(ctx);
      if (!ventana || !filas.length) {
        return vacio(host, this, 'Hace falta un período de al menos dos meses para medir avance.');
      }

      const red = ctx.avanceRed();
      const suben = filas.filter((f) => f.varOpsPorOperador !== null && f.varOpsPorOperador > 0.5).length;
      const bajan = filas.filter((f) => f.varOpsPorOperador !== null && f.varOpsPorOperador < -0.5).length;

      /* El avance por operador sube en casi todas las zonas, pero el volumen de
         la red está planchado y la dotación cae: buena parte de ese verde es el
         denominador, no más trabajo. Si la lámina no lo dice, la reunión lee
         diez flechas verdes y se va contenta. */
      const dotacion = red.varOperadores === null ? 0 : red.varOperadores;
      const cierre =
        dotacion < -0.5
          ? 'hay menos gente repartiéndose el mismo trabajo'
          : dotacion > 0.5
            ? 'y eso con más gente que al arranque'
            : 'con la misma dotación que al arranque';
      const linea =
        'Comparando <strong>' + etiquetaVentana(ventana) + '</strong>, ' + nombreDelTotal() + ' hizo <strong>' +
        F().variacion(red.varOps) + '</strong> de operaciones con <strong>' +
        F().variacion(red.varOperadores) + '</strong> de operadores (' +
        F().entero(red.inicio.operadores) + ' a ' + F().entero(red.fin.operadores) + '). ' +
        'Las operaciones por operador se mueven <strong>' + F().variacion(red.varOpsPorOperador) + '</strong>' +
        (filas.length > 1
          ? ' y ' + F().entero(suben) + ' de ' + F().entero(filas.length) + ' zonas dan verde'
          : '') +
        ': <strong>' + cierre + '</strong>.';

      const cuerpo = UI.cabecera(host, this, linea);

      const panel = UI.panel(
        'Cada zona contra su propio arranque',
        etiquetaVentana(ventana)
      );
      panel.style.flexGrow = '1';

      panel.appendChild(
        UI.tabla({
          ordenPor: 'varOpsPorOperador',
          columnas: [
            { titulo: 'Jefe zonal', clave: 'nombre', num: false },
            {
              titulo: 'Ops. por operador',
              clave: 'varOpsPorOperador',
              num: true,
              ayuda: 'Operaciones por operador al final del período, y cuánto varió contra el arranque de la propia zona. Ordena por la variación',
              render: (f) => valorConVariacion(Math.round(f.fin.opsPorOperador), f.varOpsPorOperador)
            },
            {
              titulo: 'Operadores',
              clave: 'varOperadores',
              num: true,
              ayuda: 'Legajos distintos que operaron al final, y cuánto varió. Es el denominador de la columna anterior. Ordena por la variación',
              render: (f) => valorConVariacion(f.fin.operadores, f.varOperadores)
            },
            {
              titulo: 'Ops. por local',
              clave: 'varOpsPorLocal',
              num: true,
              ayuda: 'Operaciones por local al final, y cuánto varió. Es lo que hizo la zona sin importar con cuánta gente. Ordena por la variación',
              render: (f) => valorConVariacion(Math.round(f.fin.opsPorLocal), f.varOpsPorLocal)
            },
            {
              titulo: 'Operaciones',
              clave: 'total.ops',
              num: true,
              ayuda: 'Total del período, sin normalizar: acá el tamaño sí pesa, así que no se compara entre zonas',
              render: (f) => '<span class="tenue">' + F().compacto(f.total.ops) + '</span>'
            }
          ].map(function (col) {
            // permite ordenar por campos anidados como fin.opsPorOperador
            if (col.clave && col.clave.indexOf('.') > 0) {
              const partes = col.clave.split('.');
              const clavePlana = partes.join('_');
              filas.forEach(function (f) {
                f[clavePlana] = f[partes[0]] ? f[partes[0]][partes[1]] : null;
              });
              return Object.assign({}, col, { clave: clavePlana });
            }
            return col;
          }),
          filas: filas,
          ordenable: false
        })
      );

      const leyenda = UI.leyenda([
        { color: Datos.color('positivo'), texto: 'Avanza contra su propio arranque' },
        { color: Datos.color('referencia'), texto: 'Se mantiene (±0,5%)' },
        { color: Datos.color('negativo'), texto: 'Retrocede' }
      ]);
      leyenda.style.marginTop = '7px';
      leyenda.style.flexShrink = '0';
      panel.appendChild(leyenda);

      cuerpo.appendChild(panel);
    },
    notas: function (ctx) {
      if (ctx.vacio) return '';
      const { ventana, filas } = filasAvance(ctx);
      if (!ventana || !filas.length) return '';
      const red = ctx.avanceRed();
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Esta es la lámina de la reunión. Nadie se compara con el volumen del otro: ' +
        'cada zona se compara con cómo arrancó ella misma, y todo está dividido por la cantidad de gente ' +
        'y de locales que tiene."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>Cada celda trae el <strong>valor al final del período</strong> y, al lado, cuánto varió contra ' +
        'el arranque de esa misma zona. Verde es mejorar sobre sí misma, rojo es retroceder. ' +
        'El total de operaciones está en gris al final porque <em>no</em> es comparable entre zonas: ' +
        'depende del tamaño.</p>' +
        (red.varOperadores !== null && red.varOperadores < -0.5
          ? '<p><strong>Ojo con el verde de «Ops. por operador».</strong> ' + capitalizar(nombreDelTotal()) +
            ' hizo <span class="dato">' + F().variacion(red.varOps) + '</span> de operaciones con ' +
            '<span class="dato">' + F().variacion(red.varOperadores) + '</span> de operadores: buena parte de ' +
            'esa mejora es el <strong>denominador cayendo</strong>, no más trabajo hecho. Por eso la columna ' +
            '<strong>Operadores</strong> está al lado, y conviene leer las dos juntas. Si alguien pregunta ' +
            '«¿mejoramos?», la respuesta honesta es que cada uno hace más porque somos menos.</p>'
          : '') +
        '<p>Se usan ventanas de ' + ventana.meses + (ventana.meses === 1 ? ' mes' : ' meses') +
        ' en cada extremo y no trimestres calendario, para que nunca queden afuera los meses más recientes.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Referencia: <span class="dato">' + etiquetaVentana(ventana) + '</span></li>' +
        '<li>La red: <span class="dato">' + F().variacion(red.varOpsPorOperador) + '</span> en operaciones por operador</li>' +
        '<li>Más avanza: <span class="dato">' + filas[0].nombre + '</span> (' + F().variacion(filas[0].varOpsPorOperador) + ')</li>' +
        '<li>Más retrocede: <span class="dato">' + filas[filas.length - 1].nombre + '</span> (' +
        F().variacion(filas[filas.length - 1].varOpsPorOperador) + ')</li>' +
        '</ul></div>'
      );
    }
  });

  // ------------------------------------------------------------ Lámina B

  /* Trayectoria de cada zona. Absorbió a «Evolución por jefe zonal» el
     2026-09-23: era la misma línea por zona pero en valores absolutos, así que
     en vez de dos láminas hay una con un interruptor de escala. Índice base 100
     compara recorridos; Valores absolutos muestra el volumen tal cual. */
  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Trayectoria de cada zona',
    subtitulo: 'Una línea por zona, mes a mes: indexadas a 100 para comparar recorridos, o en valores absolutos.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const { filas } = filasAvance(ctx);
      if (ctx.periodos.length < 2 || !filas.length) {
        return vacio(host, this, 'Hace falta un período de al menos dos meses para ver una trayectoria.');
      }

      let metrica = 'opsPorOperador';
      let escala = 'indice';
      const metricas = {
        opsPorOperador: { titulo: 'Operaciones por operador', serie: 'serieOpsPorOperador' },
        ops: { titulo: 'Operaciones', serie: 'serieOps' },
        operadores: { titulo: 'Operadores', serie: 'serieOperadores' }
      };
      const escalas = {
        indice: { titulo: 'Índice base 100' },
        absoluto: { titulo: 'Valores absolutos' }
      };

      const indexar = function (valores) {
        const base = valores.find((v) => v > 0);
        if (!base) return valores.map(() => null);
        return valores.map((v) => (v > 0 ? +((v / base) * 100).toFixed(1) : null));
      };

      const cuerpo = UI.cabecera(host, this, '');
      const lineaLectura = host.querySelector('.linea-lectura') || (function () {
        const p = UI.elemento('p', 'linea-lectura');
        host.querySelector('.lamina-cabecera').appendChild(p);
        return p;
      })();

      const panel = UI.panel('Trayectoria', 'una línea por zona');
      panel.style.flexGrow = '1';
      const tituloPanel = panel.querySelector('.panel-titulo').firstChild;

      /* Dos grupos de botones con estados independientes: cada uno repinta solo
         los suyos. */
      function grupo(opciones, leer, escribir) {
        const caja = UI.elemento('div');
        caja.style.cssText = 'display:flex;gap:6px';
        Object.keys(opciones).forEach(function (clave) {
          const boton = UI.elemento('button', 'boton boton-chico no-imprimir', opciones[clave].titulo);
          boton.dataset.clave = clave;
          boton.onclick = function () {
            escribir(clave);
            pintar();
          };
          caja.appendChild(boton);
        });
        caja.marcar = function () {
          Array.from(caja.querySelectorAll('button')).forEach(function (b) {
            b.className = 'boton boton-chico no-imprimir' + (b.dataset.clave === leer() ? ' boton-primario' : '');
          });
        };
        return caja;
      }

      const controlesMetrica = grupo(metricas, () => metrica, (v) => {
        metrica = v;
      });
      const controlesEscala = grupo(escalas, () => escala, (v) => {
        escala = v;
      });
      const barra = UI.elemento('div');
      barra.style.cssText = 'display:flex;gap:14px;align-items:center;flex-wrap:wrap';
      barra.appendChild(controlesMetrica);
      barra.appendChild(controlesEscala);

      const caja = UI.grafico(panel);
      cuerpo.appendChild(panel);

      function pintar() {
        controlesMetrica.marcar();
        controlesEscala.marcar();
        const esIndice = escala === 'indice';

        const series = filas.map(function (f) {
          const crudos = f[metricas[metrica].serie];
          return {
            jefe: f.jefe,
            nombre: f.nombre,
            valores: esIndice ? indexar(crudos) : crudos.map((v) => (v > 0 ? v : null)),
            crudos: crudos
          };
        });

        tituloPanel.textContent = esIndice
          ? 'Índice base 100 en ' + F().mesCorto(ctx.periodos[0])
          : metricas[metrica].titulo + ' por mes';

        const finales = series
          .map(function (s) {
            return { nombre: s.nombre, valor: s.valores[s.valores.length - 1] };
          })
          .filter((f) => f.valor !== null && f.valor !== undefined)
          .sort((a, b) => b.valor - a.valor);

        if (!finales.length) {
          lineaLectura.textContent = 'No hay series completas para este recorte.';
        } else if (esIndice) {
          lineaLectura.innerHTML =
            'Arrancando todas en 100, <strong>' + finales[0].nombre + '</strong> cierra el período en <strong>' +
            F().decimal(finales[0].valor, 0) + '</strong> y <strong>' + finales[finales.length - 1].nombre +
            '</strong> en <strong>' + F().decimal(finales[finales.length - 1].valor, 0) + '</strong>: ' +
            'la distancia entre las dos no es de tamaño, es de recorrido.';
        } else {
          lineaLectura.innerHTML =
            'En ' + F().mesCorto(ctx.periodos[ctx.periodos.length - 1]) + ', <strong>' + finales[0].nombre +
            '</strong> cierra con <strong>' + F().entero(Math.round(finales[0].valor)) + '</strong> y <strong>' +
            finales[finales.length - 1].nombre + '</strong> con <strong>' +
            F().entero(Math.round(finales[finales.length - 1].valor)) + '</strong> en ' +
            metricas[metrica].titulo.toLowerCase() + '. En valores absolutos pesa el tamaño de cada zona: ' +
            'para comparar recorridos está el índice.';
        }

        const instancia = global.Graficos.reemplazar(caja, {
          legend: { data: series.map((s) => s.nombre) },
          grid: { left: 8, right: 18, top: 30, bottom: 4, containLabel: true },
          tooltip: {
            trigger: 'axis',
            formatter: function (params) {
              const i = params[0].dataIndex;
              return global.Graficos.tooltipFilas(
                F().capitalizar(F().mes(ctx.periodos[i])) + (esIndice ? ' · índice base 100' : ''),
                params
                  .slice()
                  .sort((a, b) => b.value - a.value)
                  .map(function (p) {
                    const serie = series.find((s) => s.nombre === p.seriesName);
                    const crudo = serie ? serie.crudos[i] : null;
                    return {
                      nombre: p.seriesName,
                      valor: esIndice
                        ? F().decimal(p.value, 0) + (crudo ? ' · ' + F().entero(Math.round(crudo)) : '')
                        : F().entero(Math.round(p.value)),
                      color: p.color
                    };
                  })
              );
            }
          },
          xAxis: global.Graficos.ejeCategorias(ctx.periodos.map((p) => F().mesCorto(p))),
          yAxis: global.Graficos.ejeValores({
            /* Sin base en cero: la lámina compara recorridos, no magnitudes, y
               con el eje desde cero diez líneas entre 2,9 k y 3,5 k quedan
               pegadas. La línea de «Arranque» en 100 da la referencia en el
               modo índice, y el tooltip da el valor real en los dos. */
            scale: true,
            axisLabel: {
              color: global.Graficos.colorTexto,
              fontSize: global.Graficos.fuenteChica,
              formatter: (v) => (esIndice ? F().entero(v) : F().compacto(v))
            }
          }),
          series: series.map(function (s) {
            return global.Graficos.linea(s.nombre, s.valores, Datos.colorJefe(s.jefe), {
              symbolSize: 6,
              markLine:
                esIndice && s === series[0]
                  ? {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { type: 'dashed', color: Datos.color('referencia'), width: 1.5 },
                    label: { color: Datos.color('referencia'), fontSize: global.Graficos.fuenteChica, formatter: 'Arranque' },
                    data: [{ yAxis: 100 }]
                  }
                  : undefined
            });
          })
        });
        instancia.on('click', function (p) {
          const serie = series.find((s) => s.nombre === p.seriesName);
          if (serie) global.Filtros.alternar('jefes', serie.jefe);
        });
      }

      pintar();
    },
    notas: function (ctx) {
      if (ctx.vacio) return '';
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Acá nadie arranca arriba ni abajo: todos salen de 100. Lo único que se ve ' +
        'es el camino que hizo cada zona durante el año."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>Cada línea es una zona, indexada a 100 en su primer mes del período. Un valor de 110 significa ' +
        '10% mejor que su propio arranque; 90, 10% peor. Como todas parten del mismo punto, las diferencias ' +
        'de tamaño desaparecen y queda solo la evolución.</p>' +
        '<p>El tooltip muestra el índice y, al lado, el valor real de ese mes.</p>' +
        '<p>El botón <strong>Valores absolutos</strong> saca el índice y muestra la serie tal cual, que es ' +
        'la vista que antes vivía en una lámina aparte. Sirve para ver el volumen real de cada zona, pero ' +
        'ahí vuelve a pesar el tamaño: para comparar recorridos, el índice.</p></div>' +
        '<div class="bloque"><h4>Por qué no basta con dos puntos</h4>' +
        '<p>El tablero anterior compara principio contra final. Esta lámina muestra el recorrido entero: ' +
        'dos zonas pueden terminar en el mismo número habiendo hecho caminos muy distintos, y eso cambia ' +
        'la conversación.</p></div>'
      );
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
