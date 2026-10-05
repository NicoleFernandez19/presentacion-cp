/* §7.6 Rankings — láminas 30 a 33. */
(function (global) {
  'use strict';

  const SECCION = 'Rankings';

  function F() {
    return global.Formato;
  }

  function vacio(host, lamina, detalle) {
    const cuerpo = UI.cabecera(host, lamina, 'No hay datos con los filtros seleccionados.');
    cuerpo.appendChild(UI.vacio('Sin datos para este recorte', detalle || 'Ninguna operación cumple con todos los filtros activos.'));
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
  function filaDonasPorJefe(grupos, unidad) {
    const Datos = global.Datos;
    const filaDonas = UI.fila();
    filaDonas.style.flexShrink = '0';

    grupos.forEach(function (conf) {
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
      caja.style.flexGrow = '0';
      caja.style.height = '150px';
      filaDonas.appendChild(panel);

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
          right: 6,
          top: 'middle',
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
            radius: ['46%', '74%'],
            center: ['21%', '50%'],
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
      const mejores = ordenados.slice(0, config.rankings.locales_mejores);
      const peores = ordenados.slice(-config.rankings.locales_peores).reverse();

      const linea =
        '<strong>' + mejores[0].nombre + '</strong> lidera con <strong>' + F().decimal(mejores[0].ipPromedio, 0) +
        '</strong> operaciones por mes activo y por cajero, contra ' + F().decimal(peores[0].ipPromedio, 0) +
        ' de <strong>' + peores[0].nombre + '</strong>.';

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
              { titulo: 'Zona', num: false, render: (f) => Datos.zona(f.zona) },
              { titulo: 'IP prom.', num: true, render: (f) => F().decimal(f.ipPromedio, 0) },
              { titulo: 'Cajeros', num: true, render: (f) => F().entero(f.cajerosHabilitados) },
              { titulo: 'Ops.', num: true, render: (f) => F().entero(f.ops) }
            ],
            filas: conf.lista,
            alClic: function (f) {
              global.Navegacion.abrirDetalle(
                f.nombre,
                Datos.jefe(f.jefe) + ' · ' + Datos.localidad(f.localidad),
                global.Navegacion.detalleFilas([
                  { rotulo: 'Id local', valor: Datos.idLocal(f.local) },
                  { rotulo: 'Tipo de zona', valor: Datos.zona(f.zona) },
                  { separador: true },
                  { rotulo: 'Operaciones', valor: F().entero(f.ops) },
                  { rotulo: 'Cajeros habilitados', valor: F().entero(f.cajerosHabilitados) },
                  { rotulo: 'Con actividad', valor: F().entero(f.cajerosActivos) },
                  { rotulo: 'Sin actividad', valor: F().porcentaje(f.porcentajeInactivos) },
                  { rotulo: 'IP promedio', valor: F().decimal(f.ipPromedio, 0) },
                  { rotulo: 'Categoría del local', nodo: UI.etiquetaCategoria(f.categoria) }
                ])
              );
            }
          })
        );
        fila.appendChild(panel);
      });

      cuerpo.appendChild(fila);

      cuerpo.appendChild(
        filaDonasPorJefe(
          [
            { titulo: 'De quién son los mejores', lista: mejores, color: Datos.color('positivo'), jefeDe: (l) => l.jefe },
            { titulo: 'De quién son los peores', lista: peores, color: Datos.color('negativo'), jefeDe: (l) => l.jefe }
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
  /* Mejores y peores cajeros, con la misma estructura que la de locales: las
     dos puntas enfrentadas y, abajo, de qué zona es cada una. Las láminas de
     «Top cajeros» y «Cajeros con menor productividad» muestran las mismas dos
     listas por separado; esta las pone juntas para poder compararlas de un
     vistazo. El IP es el del recorte (D-28). */
  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Mejores y peores cajeros',
    subtitulo: 'Las dos puntas del ranking de cajeros enfrentadas, y de qué zona es cada una.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const config = Datos.config;
      const base = conIpDelRecorte(ctx.metricasCajeros().filter((m) => m.suficiente && m.ops > 0));
      if (!base.length) {
        return vacio(host, this, 'Ningún cajero del recorte llega al mínimo de ' +
          config.productividad.minimo_meses_activos + ' meses activos con operaciones.');
      }

      const modo = config.rankings.modo_por_defecto || 'relativo';
      const ordenados = ordenar(base, modo);
      const cantidad = config.rankings.cajeros_mejores;
      const mejores = ordenados.slice(0, cantidad);
      const peores = ordenados.slice(-config.rankings.cajeros_peores).reverse();
      const topeIp = ordenados.length ? ordenados[0].ipRecorte : 0;
      const decimalesIp = topeIp < 10 ? 2 : topeIp < 100 ? 1 : 0;

      let linea =
        '<strong>' + Datos.cajero(mejores[0].cajero) + '</strong> encabeza con <strong>' +
        F().decimal(mejores[0].ipRecorte, decimalesIp) + '</strong> operaciones por mes activo, contra ' +
        F().decimal(peores[0].ipRecorte, decimalesIp) + ' de <strong>' + Datos.cajero(peores[0].cajero) +
        '</strong>.';
      if (hayRecorte()) {
        linea += ' El IP está calculado con <strong>las operaciones del recorte</strong>, no con todas las del año.';
      }

      const cuerpo = UI.cabecera(host, this, linea);
      const fila = UI.fila(true);

      [
        { titulo: 'Mejores cajeros', lista: mejores, color: Datos.color('positivo'), podio: true },
        { titulo: 'Cajeros con menor IP', lista: peores, color: Datos.color('negativo'), podio: false }
      ].forEach(function (conf) {
        const panel = UI.panel(conf.titulo, 'los ' + F().entero(conf.lista.length) + ' del recorte, por IP');
        panel.style.flex = '1 1 0';
        panel.style.borderTop = '2px solid ' + conf.color;
        panel.appendChild(
          UI.tabla({
            ordenable: false,
            columnas: [
              {
                titulo: '#',
                num: true,
                render: (f, i) => UI.elemento('span', 'posicion' + (conf.podio && i < 3 ? ' podio' : ''), String(i + 1))
              },
              { titulo: 'Cajero', num: false, render: (f) => Datos.cajero(f.cajero) },
              { titulo: 'Local', num: false, render: (f) => Datos.local(f.local) },
              { titulo: 'Jefe zonal', num: false, render: (f) => Datos.jefe(jefeDe(f.local)) },
              {
                titulo: 'IP',
                num: true,
                ayuda: 'Operaciones del recorte por mes activo del cajero (D-28)',
                render: (f) => F().decimal(f.ipRecorte, decimalesIp)
              },
              { titulo: 'Ops.', num: true, render: (f) => F().entero(f.ops) },
              { titulo: 'Meses act.', num: true, render: (f) => F().entero(f.mesesActivos) },
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
            filas: conf.lista,
            alClic: function (f) {
              detalleCajero(f, null);
            }
          })
        );
        fila.appendChild(panel);
      });

      cuerpo.appendChild(fila);
      cuerpo.appendChild(
        filaDonasPorJefe(
          [
            {
              titulo: 'De quién son los mejores',
              lista: mejores,
              color: Datos.color('positivo'),
              jefeDe: (m) => jefeDe(m.local)
            },
            {
              titulo: 'De quién son los de menor IP',
              lista: peores,
              color: Datos.color('negativo'),
              jefeDe: (m) => jefeDe(m.local)
            }
          ],
          'cajeros'
        )
      );
    },
    notas: function (ctx) {
      const Datos = global.Datos;
      const config = Datos.config;
      const base = conIpDelRecorte(ctx.metricasCajeros().filter((m) => m.suficiente && m.ops > 0));
      if (!base.length) return '';
      const ordenados = ordenar(base, config.rankings.modo_por_defecto || 'relativo');
      const jefesArriba = new Set(ordenados.slice(0, config.rankings.cajeros_mejores).map((m) => jefeDe(m.local)));
      const jefesAbajo = new Set(
        ordenados.slice(-config.rankings.cajeros_peores).map((m) => jefeDe(m.local))
      );
      const enLasDos = Array.from(jefesArriba).filter((j) => jefesAbajo.has(j));
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Las dos puntas juntas, y abajo de quién es cada una. Si una zona aparece ' +
        'en las dos donas no es una contradicción: quiere decir que adentro de esa zona hay mucha ' +
        'distancia entre sus locales, que es donde está la diferencia de esta red."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>El orden es el mismo de las dos láminas anteriores: <strong>' +
        (config.rankings.modo_por_defecto === 'absoluto' ? 'absoluto' : 'relativo') +
        '</strong>, y el IP usa las operaciones que dejan los filtros. Quedan afuera los cajeros que no ' +
        'llegan a ' + config.productividad.minimo_meses_activos + ' meses activos y los que no tienen ' +
        'ninguna operación en el recorte.</p>' +
        '<p>Un puesto bajo acá <strong>no es una conclusión sobre la persona</strong>: dentro de un mismo ' +
        'local todos rinden parecido, así que buena parte de esta distancia es el local donde atiende ' +
        'cada uno.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Cajeros comparables: <span class="dato">' + F().entero(base.length) + '</span></li>' +
        '<li>Zonas en las dos puntas: <span class="dato">' + F().entero(enLasDos.length) + '</span> de ' +
        F().entero(Datos.raw.dim.jefes.length) + '</li>' +
        '</ul></div>'
      );
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
