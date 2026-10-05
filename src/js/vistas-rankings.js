/* §7.6 Rankings — láminas 30 a 33. */
(function (global) {
  'use strict';

  const SECCION = 'Rankings';

  function F() {
    return global.Formato;
  }

  function vacio(host, lamina, detalle) {
    const cuerpo = UI.cabecera(host, lamina, 'No hay datos para mostrar.');
    cuerpo.appendChild(UI.vacio('Sin datos para este recorte', detalle || 'No hay operaciones en el período.'));
  }

  /* Cuántas filas entran en cada lista sin scroll (config.presentacion). */
  function filasPorLista() {
    return global.Datos.config.presentacion.filas_ranking || 5;
  }

  function jefeDe(local) {
    return local >= 0 ? global.Datos.raw.dim.locales.jefe[local] : -1;
  }

  /* IP del recorte (D-28). El numerador son las operaciones que quedan con los
     filtros activos; el denominador sigue siendo los meses activos del cajero,
     sin tocar (D-02). Sin filtros que recorten operaciones da exactamente el IP
     de la red.

     El percentil también se recalcula sobre el recorte, dentro de cada tipo de
     zona: si no, el orden «relativo» —que es el que viene por defecto— no se
     movería al elegir un grupo, y la lámina mostraría al mejor de la red con 21
     operaciones de TEC.

     La CATEGORÍA no se toca: sigue siendo la de la red (§4.6), y el motor
     tampoco cambia. */
  function conIpDelRecorte(lista) {
    const filas = lista.map(function (m) {
      return Object.assign({}, m, {
        ipRecorte: m.mesesActivos > 0 ? m.ops / m.mesesActivos : 0,
        percentilRecorte: -1
      });
    });
    [0, 1].forEach(function (zona) {
      const indices = [];
      filas.forEach(function (f, i) {
        if (f.zona === zona) indices.push(i);
      });
      if (!indices.length) return;
      const pcts = global.Metricas.percentiles(indices.map((i) => filas[i].ipRecorte));
      indices.forEach(function (i, k) {
        filas[i].percentilRecorte = pcts[k];
      });
    });
    return filas;
  }

  /* Campos de la barra que recortan operaciones: con alguno activo, el IP que
     se muestra ya no es el del año completo y hay que decirlo. */
  function hayRecorte() {
    const e = global.Filtros.estado;
    return ['jefes', 'tiposZona', 'localidades', 'locales', 'grupos', 'tipos'].some(function (campo) {
      return e[campo] && e[campo].length;
    });
  }

  /* Fila de donas «de quién son»: una por punta del ranking, con el reparto por
     jefe zonal. El color sigue al jefe —el mismo en las dos donas, porque sigue
     a la persona y no al puesto— y la leyenda lleva nombre, cantidad y
     porcentaje, así la identidad nunca depende solo del color (§8).

     Con más de siete jefes distintos la torta queda al límite de lo legible; lo
     que la sostiene es la leyenda, que nombra a todos. Si alguna vez incomoda,
     el reemplazo natural es una barra horizontal. */
  function panelDonaPorJefe(conf, unidad, lateral) {
    const Datos = global.Datos;
    {
      const porJefe = new Map();
      conf.lista.forEach(function (x) {
        porJefe.set(conf.jefeDe(x), (porJefe.get(conf.jefeDe(x)) || 0) + 1);
      });
      const reparto = Array.from(porJefe.entries()).sort(function (a, b) {
        if (b[1] !== a[1]) return b[1] - a[1];
        return Datos.jefe(a[0]).localeCompare(Datos.jefe(b[0]), 'es');
      });

      const total = conf.lista.length;
      const panel = UI.panel(
        conf.titulo,
        F().entero(total) + ' ' + unidad + ' · ' + F().entero(reparto.length) + ' de ' +
          F().entero(Datos.raw.dim.jefes.length) + ' jefes zonales'
      );
      panel.style.flex = '1 1 0';
      panel.style.borderTop = '2px solid ' + conf.color;
      const caja = UI.grafico(panel);
      /* Lateral: la dona ocupa el alto de la lámina, al costado de la tabla, y la
         leyenda va abajo. Apilada: una fila baja con la leyenda a la derecha. */
      if (!lateral) {
        caja.style.flexGrow = '0';
        caja.style.height = '150px';
      }

      const etiqueta = new Map();
      reparto.forEach(function (e) {
        etiqueta.set(
          Datos.jefe(e[0]),
          Datos.jefe(e[0]) + '  ' + F().entero(e[1]) + ' · ' + F().porcentaje((e[1] / total) * 100, 0)
        );
      });

      const instancia = global.Graficos.reemplazar(caja, {
        /* La leyenda al costado en vez de etiquetas alrededor de la dona:
           ocupa la mitad de alto y le deja la tabla entera a la lámina. */
        legend: {
          show: true,
          type: 'scroll',
          orient: 'vertical',
          right: lateral ? 'auto' : 6,
          left: lateral ? 'center' : 'auto',
          bottom: lateral ? 0 : 'auto',
          top: lateral ? 'auto' : 'middle',
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 6,
          formatter: (nombre) => etiqueta.get(nombre) || nombre
        },
        tooltip: {
          trigger: 'item',
          formatter: function (p) {
            return global.Graficos.tooltipFilas(p.name, [
              { nombre: 'En esta lista', valor: F().entero(p.value) + ' de ' + F().entero(total) + ' ' + unidad },
              { nombre: 'Porcentaje', valor: F().porcentaje(p.percent, 0) }
            ]);
          }
        },
        series: [
          {
            type: 'pie',
            radius: lateral ? ['34%', '60%'] : ['46%', '74%'],
            center: lateral ? ['50%', '34%'] : ['21%', '50%'],
            minAngle: 6,
            // 2 px de superficie entre porciones, para que no se toquen
            itemStyle: { borderColor: '#0f121d', borderWidth: 2, borderRadius: 3 },
            label: { show: false },
            labelLine: { show: false },
            emphasis: { scaleSize: 5 },
            data: reparto.map(function (e) {
              return {
                name: Datos.jefe(e[0]),
                value: e[1],
                jefe: e[0],
                itemStyle: { color: Datos.colorJefe(e[0]) }
              };
            })
          }
        ]
      });
      if (instancia) {
        instancia.on('click', function (p) {
          if (p.data && p.data.jefe !== undefined) global.Filtros.alternar('jefes', p.data.jefe);
        });
      }
      return panel;
    }
  }

  function filaDonasPorJefe(grupos, unidad) {
    const filaDonas = UI.fila();
    filaDonas.style.flexShrink = '0';
    grupos.forEach(function (conf) {
      filaDonas.appendChild(panelDonaPorJefe(conf, unidad, false));
    });
    return filaDonas;
  }

  /* §4.9 — relativo ordena por percentil dentro del tipo de zona y desempata por
     IP; absoluto ordena por IP a secas. Los dos sobre el recorte (D-28). */
  function ordenar(lista, modo) {
    return lista.slice().sort(function (a, b) {
      if (modo === 'absoluto') return b.ipRecorte - a.ipRecorte;
      if (b.percentilRecorte !== a.percentilRecorte) return b.percentilRecorte - a.percentilRecorte;
      return b.ipRecorte - a.ipRecorte;
    });
  }

  function detalleCajero(m, posicionRed) {
    const Datos = global.Datos;
    const filas = [
      { rotulo: 'Legajo', valor: Datos.idCajero(m.cajero) },
      { rotulo: 'Local', valor: Datos.local(m.local) },
      { rotulo: 'Jefe zonal', valor: Datos.jefe(jefeDe(m.local)) },
      { rotulo: 'Tipo de zona', valor: Datos.zona(m.zona) },
      { separador: true },
      { rotulo: 'Operaciones', valor: F().entero(m.ops) },
      { rotulo: 'Meses activos', valor: F().entero(m.mesesActivos) + ' de ' + F().entero(m.mesesHabilitado) },
      { rotulo: 'IP del recorte', valor: F().decimal(m.ipRecorte, 0) },
      { rotulo: 'Percentil en el recorte', valor: F().decimal(m.percentilRecorte, 0) },
      { rotulo: 'Categoría', nodo: UI.etiquetaCategoria(m.categoria) }
    ];
    // Con un recorte activo conviven dos IP: el de la pantalla y el del año
    // completo, que es el que define la categoría. Se muestran los dos.
    if (Math.round(m.ip) !== Math.round(m.ipRecorte)) {
      filas.splice(filas.length - 1, 0, { rotulo: 'IP del año (define la categoría)', valor: F().decimal(m.ip, 0) });
    }
    if (posicionRed) filas.push({ rotulo: 'Posición en la red', valor: '#' + F().entero(posicionRed) });
    global.Navegacion.abrirDetalle(Datos.cajero(m.cajero), Datos.local(m.local), global.Navegacion.detalleFilas(filas));
  }

  // ----------------------------------------------------------- Lámina 33

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Mejores y peores locales',
    subtitulo: 'Los locales con mayor y menor IP promedio entre sus cajeros.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const config = Datos.config;
      /* Fuera las aperturas y los cierres: un local con cuatro meses de vida no
         es un local flojo, y mezclarlos era la forma más rápida de castigar a
         quien abrió un punto. El mínimo nunca supera los meses del recorte, para
         que la lámina no quede vacía al filtrar un mes suelto. */
      const minimoMeses = Math.min(config.rankings.minimo_meses_local || 0, ctx.periodos.length);
      const comparables = ctx.metricasLocales().filter((l) => l.ipPromedio !== null);
      const locales = comparables.filter((l) => l.mesesActivos >= minimoMeses);
      const excluidos = comparables.length - locales.length;
      if (!locales.length) {
        return vacio(host, this, 'Ningún local del recorte llega a ' + minimoMeses +
          ' meses con actividad y cajeros con datos suficientes.');
      }

      const ordenados = locales.slice().sort((a, b) => b.ipPromedio - a.ipPromedio);
      const mejores = ordenados.slice(0, filasPorLista());
      const peores = ordenados.slice(-filasPorLista()).reverse();

      const linea =
        '<strong>' + mejores[0].nombre + '</strong> lidera con <strong>' + F().decimal(mejores[0].ipPromedio, 0) +
        '</strong> operaciones por mes activo y por cajero, contra ' + F().decimal(peores[0].ipPromedio, 0) +
        ' de <strong>' + peores[0].nombre + '</strong>.';

      if (peores[0].ipPromedio > 0) {
        this.tituloActual = 'El mejor local rinde ' + F().decimal(mejores[0].ipPromedio / peores[0].ipPromedio, 1) +
          ' veces lo que el último';
      }
      const cuerpo = UI.cabecera(host, this, linea);
      const fila = UI.fila(true);

      [
        { titulo: 'Mejores locales', lista: mejores, color: Datos.color('positivo'), podio: true },
        { titulo: 'Peores locales', lista: peores, color: Datos.color('negativo'), podio: false }
      ].forEach(function (conf) {
        const panel = UI.panel(
          conf.titulo,
          'por IP promedio de sus cajeros · ' + minimoMeses + ' meses o más de actividad'
        );
        panel.style.flex = '1 1 0';
        panel.style.borderTop = '2px solid ' + conf.color;
        panel.appendChild(
          UI.tabla({
            ordenable: false,
            columnas: [
              { titulo: '#', num: true, render: (f, i) => UI.elemento('span', 'posicion' + (conf.podio && i < 3 ? ' podio' : ''), String(i + 1)) },
              { titulo: 'Local', num: false, render: (f) => f.nombre },
              { titulo: 'Jefe zonal', num: false, render: (f) => Datos.jefe(f.jefe) },
              { titulo: 'IP prom.', num: true, render: (f) => F().decimal(f.ipPromedio, 0) },
              { titulo: 'Cajeros', num: true, render: (f) => F().entero(f.cajerosHabilitados) }
            ],
            filas: conf.lista
          })
        );
        fila.appendChild(panel);
      });

      cuerpo.appendChild(fila);

      /* Las donas cuentan el ranking completo de config.rankings, no solo las
         filas que entran en la tabla. */
      cuerpo.appendChild(
        filaDonasPorJefe(
          [
            { titulo: 'De quién son los mejores', lista: ordenados.slice(0, config.rankings.locales_mejores), color: Datos.color('positivo'), jefeDe: (l) => l.jefe },
            { titulo: 'De quién son los peores', lista: ordenados.slice(-config.rankings.locales_peores), color: Datos.color('negativo'), jefeDe: (l) => l.jefe }
          ],
          'locales'
        )
      );
    },
    notas: function (ctx) {
      const config = global.Datos.config;
      const minimoMeses = Math.min(config.rankings.minimo_meses_local || 0, ctx.periodos.length);
      const comparables = ctx.metricasLocales().filter((l) => l.ipPromedio !== null);
      const locales = comparables.filter((l) => l.mesesActivos >= minimoMeses);
      const excluidos = comparables.length - locales.length;
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Un local es el promedio de su gente, pero también de su ubicación. ' +
        'Antes de sacar conclusiones conviene mirar la lámina de comparación contra el grupo de referencia."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>El IP promedio del local es el promedio del IP de sus cajeros con datos suficientes, así que un ' +
        'local con un solo cajero puede aparecer arriba o abajo con poca evidencia detrás. El tooltip muestra ' +
        'cuántos cajeros lo sostienen.</p>' +
        '<p>Entran solo los locales con <strong>' + minimoMeses + ' meses o más de actividad</strong>. ' +
        'Sin ese corte, los últimos puestos se llenaban de aperturas del año: un local con cuatro meses de ' +
        'vida rinde poco porque recién arranca, no porque se trabaje mal.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Locales comparables: <span class="dato">' + F().entero(locales.length) + '</span></li>' +
        (excluidos
          ? '<li>Dejados afuera por poca vida: <span class="dato">' + F().entero(excluidos) + '</span></li>'
          : '') +
        '</ul></div>'
      );
    }
  });
  /* Cajeros: una lámina por punta del ranking. A la izquierda la lista completa
     (config.rankings.cajeros_mejores / cajeros_peores) y al costado una dona con
     de qué jefe zonal es cada uno. Así el top 20 se lee entero y el reparto por
     zona queda al lado, en vez de apretar las dos puntas en una sola lámina.
     El IP es el del recorte (D-28). */
  function laminaCajeros(conf) {
    function base(ctx) {
      const lista = conIpDelRecorte(ctx.metricasCajeros().filter((m) => m.suficiente && m.ops > 0));
      if (!lista.length) return null;
      const ordenados = ordenar(lista, global.Datos.config.rankings.modo_por_defecto || 'relativo');
      const n = global.Datos.config.rankings[conf.clave];
      return {
        total: lista.length,
        elegidos: conf.mejores ? ordenados.slice(0, n) : ordenados.slice(-n).reverse()
      };
    }

    global.Navegacion.registrar({
      seccion: SECCION,
      titulo: conf.titulo,
      subtitulo: conf.subtitulo,
      render: function (host, ctx) {
        if (ctx.vacio) return vacio(host, this);
        const Datos = global.Datos;
        const config = Datos.config;
        const datos = base(ctx);
        if (!datos) {
          return vacio(host, this, 'Ningún cajero del recorte llega al mínimo de ' +
            config.productividad.minimo_meses_activos + ' meses activos con operaciones.');
        }
        const lista = datos.elegidos;
        const tope = lista[0].ipRecorte;
        const decimalesIp = tope < 10 ? 2 : tope < 100 ? 1 : 0;

        const cuerpo = UI.cabecera(
          host,
          this,
          '<strong>' + Datos.cajero(lista[0].cajero) + '</strong> ' + conf.verbo + ' con <strong>' +
            F().decimal(lista[0].ipRecorte, decimalesIp) + '</strong> operaciones por mes activo.'
        );
        const fila = UI.fila(true);

        const panelLista = UI.panel(conf.panel, 'por IP, sobre ' + F().entero(datos.total) + ' cajeros con datos suficientes');
        panelLista.style.flex = '3 1 0';
        panelLista.style.borderTop = '2px solid ' + global.Datos.color(conf.color);
        panelLista.appendChild(
          UI.tabla({
            ordenable: false,
            columnas: [
              {
                titulo: '#',
                num: true,
                render: (f, i) => UI.elemento('span', 'posicion' + (conf.mejores && i < 3 ? ' podio' : ''), String(i + 1))
              },
              { titulo: 'Cajero', num: false, render: (f) => Datos.cajero(f.cajero) },
              { titulo: 'Local', num: false, render: (f) => Datos.local(f.local) },
              { titulo: 'Jefe zonal', num: false, render: (f) => Datos.jefe(jefeDe(f.local)) },
              {
                titulo: 'IP',
                num: true,
                ayuda: 'Operaciones por mes activo del cajero',
                render: (f) => F().decimal(f.ipRecorte, decimalesIp)
              },
              {
                titulo: 'Categoría',
                num: false,
                render: function (f) {
                  const caja = UI.elemento('span');
                  caja.appendChild(UI.etiquetaCategoria(f.categoria));
                  return caja;
                }
              }
            ],
            filas: lista
          })
        );
        panelLista.classList.add('tabla-compacta');
        fila.appendChild(panelLista);

        const dona = panelDonaPorJefe(
          { titulo: 'De qué zona son', lista: lista, color: global.Datos.color(conf.color), jefeDe: (m) => jefeDe(m.local) },
          'cajeros',
          true
        );
        dona.style.flex = '1.2 1 0';
        fila.appendChild(dona);

        cuerpo.appendChild(fila);
      },
      notas: function (ctx) {
        const Datos = global.Datos;
        const config = Datos.config;
        const datos = base(ctx);
        if (!datos) return '';
        const zonas = new Set(datos.elegidos.map((m) => jefeDe(m.local)));
        return (
          '<div class="bloque"><h4>Guión para el orador</h4>' +
          '<div class="guion">"' + conf.guion + '"</div></div>' +
          '<div class="bloque"><h4>Cómo se lee</h4>' +
          '<p>El orden es <strong>' +
          (config.rankings.modo_por_defecto === 'absoluto' ? 'absoluto' : 'relativo') +
          '</strong>. Quedan afuera los cajeros que no llegan a ' + config.productividad.minimo_meses_activos +
          ' meses activos y los que no tienen ninguna operación en el recorte.</p>' +
          '<p>Un puesto acá <strong>no es una conclusión sobre la persona</strong>: dentro de un mismo ' +
          'local todos rinden parecido, así que buena parte de esta distancia es el local donde atiende ' +
          'cada uno.</p></div>' +
          '<div class="bloque"><h4>Datos</h4><ul>' +
          '<li>Cajeros comparables: <span class="dato">' + F().entero(datos.total) + '</span></li>' +
          '<li>Zonas en esta lista: <span class="dato">' + F().entero(zonas.size) + '</span> de ' +
          F().entero(Datos.raw.dim.jefes.length) + '</li>' +
          '</ul></div>'
        );
      }
    });
  }

  laminaCajeros({
    clave: 'cajeros_mejores',
    mejores: true,
    titulo: 'Mejores cajeros',
    subtitulo: 'Los cajeros con mayor IP de la red y de qué zona es cada uno.',
    panel: 'Mejores cajeros',
    verbo: 'encabeza',
    color: 'positivo',
    guion: 'Estos son los que más rinden. A la derecha, de quién es cada uno: si una zona se lleva buena parte de la lista, ahí hay algo que vale la pena copiar.'
  });

  laminaCajeros({
    clave: 'cajeros_peores',
    mejores: false,
    titulo: 'Cajeros con menor IP',
    subtitulo: 'Los cajeros con menor IP de la red y de qué zona es cada uno.',
    panel: 'Cajeros con menor IP',
    verbo: 'cierra la lista',
    color: 'negativo',
    guion: 'Estos son los que menos operan por mes activo. A la derecha, de quién es cada uno. Si una zona aparece en las dos listas, quiere decir que adentro de esa zona hay mucha distancia entre sus locales.'
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
