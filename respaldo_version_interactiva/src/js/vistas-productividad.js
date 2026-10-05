/* §7.5 Productividad — láminas 21 a 29.

   Invariante de §4.6: las categorías se calculan con el período elegido y sobre
   TODA la red. Ningún otro filtro las cambia; solo cambian qué cajeros se ven.
   Por eso acá nunca se recalcula una categoría: se lee la que trae el motor. */
(function (global) {
  'use strict';

  const SECCION = 'Productividad';
  const CATEGORIAS = ['alta', 'media', 'baja'];

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

  function detalleCajero(m) {
    const Datos = global.Datos;
    global.Navegacion.abrirDetalle(
      Datos.cajero(m.cajero),
      Datos.local(m.local) + ' · ' + Datos.jefe(jefeDe(m.local)),
      global.Navegacion.detalleFilas([
        { rotulo: 'Legajo', valor: Datos.idCajero(m.cajero) },
        { rotulo: 'Tipo de zona', valor: Datos.zona(m.zona) },
        { separador: true },
        { rotulo: 'Operaciones del período', valor: F().entero(m.ops) },
        { rotulo: 'Meses activos', valor: F().entero(m.mesesActivos) + ' de ' + F().entero(m.mesesHabilitado) },
        { rotulo: 'IP (ops. por mes activo)', valor: m.suficiente ? F().decimal(m.ip, 0) : '—' },
        { rotulo: 'Percentil en su zona', valor: m.suficiente ? F().decimal(m.percentil, 0) : '—' },
        { rotulo: 'Categoría', nodo: UI.etiquetaCategoria(m.categoria) }
      ])
    );
  }

  /* Reparto de categorías de una lista de cajeros. */
  function reparto(metricas) {
    const conteo = { alta: 0, media: 0, baja: 0, sin_datos: 0 };
    metricas.forEach((m) => conteo[m.categoria]++);
    conteo.conCategoria = conteo.alta + conteo.media + conteo.baja;
    return conteo;
  }

  // ----------------------------------------------------------- Lámina 21

  global.Navegacion.registrar({
    seccion: 'Anexo',
    titulo: 'Criterio de categorías',
    subtitulo: 'Qué es el IP, por qué se compara dentro del tipo de zona y cuáles son los umbrales vigentes.',
    render: function (host, ctx) {
      const Datos = global.Datos;
      const config = Datos.config;
      const cats = ctx.categorias;
      const metricas = ctx.metricasCajeros();
      const conteo = reparto(metricas);

      const linea =
        'Con el período elegido, un cajero entra en <strong>' + Datos.categoria('alta') + '</strong> si supera el percentil ' +
        F().entero(config.productividad.percentil_corte_alto) + ' de su tipo de zona: hoy son <strong>' +
        F().entero(conteo.alta) + '</strong> de ' + F().entero(conteo.conCategoria) + ' cajeros con datos suficientes.';

      const cuerpo = UI.cabecera(host, this, linea);
      const fila = UI.fila(true);

      // Explicación
      const panelTexto = UI.panel('Cómo se calcula');
      panelTexto.style.flex = '1 1 0';
      const texto = UI.elemento('div');
      texto.style.cssText = 'font-size:13.5px;line-height:1.6;color:var(--texto);display:flex;flex-direction:column;gap:9px;overflow:auto';
      texto.innerHTML =
        '<div><strong style="color:var(--amarillo)">Índice de productividad (IP)</strong><br>' +
        'Operaciones del período dividido los <strong>meses activos</strong> del cajero. ' +
        'Un mes activo es un mes con al menos una operación, así que no penaliza a quien entró a mitad de año ' +
        'ni a quien estuvo de licencia.</div>' +
        '<div><strong style="color:var(--amarillo)">Por qué se separa por tipo de zona</strong><br>' +
        'Un cajero de bajo movimiento no puede hacer el volumen de uno de alto movimiento: no es su desempeño, ' +
        'es su localidad. Cada uno se compara solo contra los de su mismo tipo de zona.</div>' +
        '<div><strong style="color:var(--amarillo)">Mínimo para recibir categoría</strong><br>' +
        F().entero(config.productividad.minimo_meses_activos) + ' meses activos en el período (' +
        F().entero(config.productividad.minimo_meses_activos_trimestre) + ' por trimestre en las láminas trimestrales). ' +
        'Por debajo de eso aparece como «' + Datos.categoria('sin_datos') + '»: ' +
        F().entero(conteo.sin_datos) + ' cajeros hoy.</div>' +
        '<div><strong style="color:var(--amarillo)">Los filtros no cambian la categoría</strong><br>' +
        'Los umbrales se calculan siempre sobre toda la red con el período elegido. Filtrar por zona, localidad, ' +
        'local o tipo de operación cambia <em>qué cajeros se muestran</em>, nunca en qué categoría está cada uno.</div>';
      panelTexto.appendChild(texto);
      fila.appendChild(panelTexto);

      // Umbrales vigentes
      const panelTabla = UI.panel('Umbrales vigentes', F().capitalizar(F().rangoPeriodos(ctx.periodos)));
      panelTabla.style.flex = '1 1 0';

      const filasUmbral = [0, 1]
        .filter((z) => cats.umbrales[z] && cats.umbrales[z].cajeros)
        .map(function (z) {
          const u = cats.umbrales[z];
          return {
            zona: z,
            nombre: Datos.zona(z),
            cajeros: u.cajeros,
            corteBajo: u.corteBajo,
            corteAlto: u.corteAlto,
            mediana: u.ipMediana,
            maximo: u.ipMax
          };
        });

      panelTabla.appendChild(
        UI.tabla({
          ordenable: false,
          columnas: [
            { titulo: 'Tipo de zona', render: (f) => f.nombre },
            { titulo: 'Cajeros', num: true, render: (f) => F().entero(f.cajeros) },
            { titulo: 'Baja hasta', num: true, render: (f) => F().decimal(f.corteBajo, 0) },
            { titulo: 'Alta desde', num: true, render: (f) => F().decimal(f.corteAlto, 0) },
            { titulo: 'Mediana', num: true, render: (f) => F().decimal(f.mediana, 0) },
            { titulo: 'Máximo', num: true, render: (f) => F().decimal(f.maximo, 0) }
          ],
          filas: filasUmbral
        })
      );

      const leyenda = UI.leyenda(
        CATEGORIAS.concat(['sin_datos']).map(function (c) {
          return { color: Datos.colorCategoria(c), texto: Datos.categoria(c) + ' · ' + F().entero(conteo[c]) };
        })
      );
      leyenda.style.marginTop = '8px';
      leyenda.style.flexShrink = '0';
      panelTabla.appendChild(leyenda);
      fila.appendChild(panelTabla);

      cuerpo.appendChild(fila);
    },
    notas: function (ctx) {
      const Datos = global.Datos;
      const cats = ctx.categorias;
      const config = Datos.config;
      const u0 = cats.umbrales[0] || {};
      const u1 = cats.umbrales[1] || {};
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Antes de mirar los rankings conviene dejar claro contra qué se compara cada uno. ' +
        'Nadie se mide contra la red entera: se mide contra los de su mismo tipo de zona."</div></div>' +
        '<div class="bloque"><h4>Si alguien pregunta</h4>' +
        '<p><em>¿Por qué por mes activo y no por día?</em> Porque los datos disponibles no tienen ' +
        'granularidad diaria para todos los tipos de operación. Está documentado como decisión D-02.</p>' +
        '<p><em>¿Y si filtro mi zona cambian los umbrales?</em> No. Se calculan una vez sobre toda la red.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Alta desde (alto movimiento): <span class="dato">' + F().decimal(u0.corteAlto, 0) + '</span></li>' +
        '<li>Alta desde (bajo movimiento): <span class="dato">' + F().decimal(u1.corteAlto, 0) + '</span></li>' +
        '<li>Mínimo de meses activos: <span class="dato">' + config.productividad.minimo_meses_activos + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // ----------------------------------------------------------- Lámina 23

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Categorías por jefe zonal',
    subtitulo: 'Cómo se reparten Alta, Media y Baja en cada zona.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const metricas = ctx.metricasCajeros();

      const porJefe = new Map();
      metricas.forEach(function (m) {
        const j = jefeDe(m.local);
        if (!porJefe.has(j)) porJefe.set(j, { jefe: j, nombre: Datos.jefe(j), lista: [] });
        porJefe.get(j).lista.push(m);
      });

      const filas = Array.from(porJefe.values()).map(function (f) {
        const r = reparto(f.lista);
        return Object.assign(f, r, {
          porcentajeAlta: r.conCategoria ? (r.alta / r.conCategoria) * 100 : 0,
          total: f.lista.length
        });
      }).sort((a, b) => b.porcentajeAlta - a.porcentajeAlta);

      const red = reparto(metricas);
      const porcentajeRed = red.conCategoria ? (red.alta / red.conCategoria) * 100 : 0;

      const linea =
        '<strong>' + filas[0].nombre + '</strong> es la zona con mayor proporción de productividad alta (' +
        F().porcentaje(filas[0].porcentajeAlta) + '), contra <strong>' + F().porcentaje(porcentajeRed) + '</strong> de la red.';

      const cuerpo = UI.cabecera(host, this, linea);
      const panel = UI.panel('Cajeros por categoría y zona');
      panel.style.flexGrow = '1';
      const boton = UI.elemento('button', 'boton boton-chico no-imprimir', 'Ver porcentaje');
      panel.querySelector('.panel-titulo').appendChild(boton);
      const caja = UI.grafico(panel);
      cuerpo.appendChild(panel);

      let comoPorcentaje = false;
      boton.onclick = function () {
        comoPorcentaje = !comoPorcentaje;
        boton.textContent = comoPorcentaje ? 'Ver cantidad' : 'Ver porcentaje';
        pintar();
      };

      function pintar() {
        const series = CATEGORIAS.map(function (c) {
          return global.Graficos.barraApilada(
            Datos.categoria(c),
            filas.map(function (f) {
              if (!comoPorcentaje) return f[c];
              return f.conCategoria ? +((f[c] / f.conCategoria) * 100).toFixed(1) : 0;
            }),
            Datos.colorCategoria(c)
          );
        });

        const instancia = global.Graficos.reemplazar(caja, {
          legend: { data: series.map((s) => s.name) },
          grid: { left: 8, right: 14, top: 30, bottom: 4, containLabel: true },
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: function (params) {
              const f = filas[params[0].dataIndex];
              return global.Graficos.tooltipFilas(
                f.nombre + ' · ' + F().entero(f.conCategoria) + ' con categoría',
                CATEGORIAS.map(function (c) {
                  return {
                    nombre: Datos.categoria(c),
                    valor: F().entero(f[c]) + ' (' + F().porcentaje(f.conCategoria ? (f[c] / f.conCategoria) * 100 : 0) + ')',
                    color: Datos.colorCategoria(c)
                  };
                }).concat([{ nombre: Datos.categoria('sin_datos'), valor: F().entero(f.sin_datos) }])
              );
            }
          },
          xAxis: global.Graficos.ejeCategorias(filas.map((f) => f.nombre), {
            axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, interval: 0, rotate: filas.length > 6 ? 30 : 0, hideOverlap: false }
          }),
          yAxis: global.Graficos.ejeValores(
            comoPorcentaje
              ? { max: 100, axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, formatter: (v) => v + '%' } }
              : {}
          ),
          series: series
        });
        instancia.on('click', function (p) {
          global.Filtros.alternar('jefes', filas[p.dataIndex].jefe);
        });
      }

      pintar();
    },
    notas: function (ctx) {
      const Datos = global.Datos;
      const metricas = ctx.metricasCajeros();
      const red = reparto(metricas);
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Como los umbrales son de la red, si una zona tuviera exactamente el promedio ' +
        'le tocaría un tercio en cada categoría. Lo que se ve acá es quién se despega de ese tercio."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>En modo porcentaje, las tres barras suman 100% sobre los cajeros con datos suficientes: ' +
        'los «' + Datos.categoria('sin_datos') + '» quedan afuera del cálculo y aparecen en el tooltip.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        CATEGORIAS.map(function (c) {
          return '<li>' + Datos.categoria(c) + ': <span class="dato">' + F().entero(red[c]) + '</span> (' +
            F().porcentaje(red.conCategoria ? (red[c] / red.conCategoria) * 100 : 0) + ')</li>';
        }).join('') +
        '</ul></div>'
      );
    }
  });

  // ----------------------------------------------------------- Lámina 29

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Capacitaciones',
    subtitulo: 'El IP de los cajeros antes y después de cada capacitación.',
    requiere: 'capacitaciones',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const motor = global.Filtros.motor;
      const raw = Datos.raw;
      const visibles = new Set(ctx.metricasCajeros().map((m) => m.cajero));

      const porNombre = new Map();
      raw.capacitaciones.forEach(function (c) {
        if (!visibles.has(c.cajero)) return;
        const periodo = Math.floor(c.fecha / 100);
        if (ctx.periodos.indexOf(periodo) < 0) return;
        if (!porNombre.has(c.nombre)) porNombre.set(c.nombre, { nombre: c.nombre, cajeros: [], periodos: [] });
        porNombre.get(c.nombre).cajeros.push(c.cajero);
        porNombre.get(c.nombre).periodos.push(periodo);
      });

      if (!porNombre.size) return vacio(host, this, 'No hay capacitaciones dentro del período y el recorte elegidos.');

      const filas = Array.from(porNombre.values()).map(function (c) {
        const corte = Math.min.apply(null, c.periodos);
        const antes = ctx.periodos.filter((p) => p < corte);
        const despues = ctx.periodos.filter((p) => p >= corte);
        const catAntes = antes.length ? motor.categorias(antes, 1) : null;
        const catDespues = despues.length ? motor.categorias(despues, 1) : null;
        const promedio = function (cats) {
          if (!cats) return null;
          let suma = 0;
          let n = 0;
          c.cajeros.forEach(function (cajero) {
            if (cats.mesesActivos[cajero] > 0) {
              suma += cats.ip[cajero];
              n++;
            }
          });
          return n > 0 ? suma / n : null;
        };
        const ipAntes = promedio(catAntes);
        const ipDespues = promedio(catDespues);
        return {
          nombre: c.nombre,
          cajeros: c.cajeros.length,
          corte: corte,
          ipAntes: ipAntes,
          ipDespues: ipDespues,
          variacion: ipAntes && ipDespues ? ((ipDespues - ipAntes) / ipAntes) * 100 : null
        };
      }).sort((a, b) => a.corte - b.corte);

      const conDato = filas.filter((f) => f.variacion !== null);
      const linea = conDato.length
        ? '<strong>' + F().entero(conDato.filter((f) => f.variacion > 0).length) + '</strong> de ' +
        F().entero(conDato.length) + ' capacitaciones muestran un IP promedio mayor después que antes.'
        : 'No hay meses suficientes antes y después de las capacitaciones para comparar.';

      const cuerpo = UI.cabecera(host, this, linea);
      const fila = UI.fila(true);

      const panel = UI.panel('IP promedio antes y después', 'promedio de los cajeros que hicieron cada capacitación');
      panel.style.flex = '1.2 1 0';
      const caja = UI.grafico(panel);
      fila.appendChild(panel);

      const panelTabla = UI.panel('Detalle');
      panelTabla.style.flex = '1 1 0';
      panelTabla.appendChild(
        UI.tabla({
          ordenable: false,
          columnas: [
            { titulo: 'Capacitación', render: (f) => f.nombre },
            { titulo: 'Cajeros', num: true, render: (f) => F().entero(f.cajeros) },
            { titulo: 'Desde', num: true, render: (f) => F().mesCorto(f.corte) },
            { titulo: 'IP antes', num: true, render: (f) => (f.ipAntes === null ? '—' : F().decimal(f.ipAntes, 0)) },
            { titulo: 'IP después', num: true, render: (f) => (f.ipDespues === null ? '—' : F().decimal(f.ipDespues, 0)) },
            {
              titulo: 'Variación',
              num: true,
              render: function (f) {
                if (f.variacion === null) return '—';
                const color = f.variacion >= 0 ? Datos.color('positivo') : Datos.color('negativo');
                return '<span style="color:' + color + ';font-weight:700">' + F().variacion(f.variacion) + '</span>';
              }
            }
          ],
          filas: filas
        })
      );
      fila.appendChild(panelTabla);
      cuerpo.appendChild(fila);

      global.Graficos.crear(caja, {
        legend: { data: ['Antes', 'Después'] },
        grid: { left: 8, right: 16, top: 30, bottom: 4, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            const f = filas[params[0].dataIndex];
            return global.Graficos.tooltipFilas(f.nombre, [
              { nombre: 'Cajeros', valor: F().entero(f.cajeros) },
              { nombre: 'IP antes', valor: f.ipAntes === null ? '—' : F().decimal(f.ipAntes, 0) },
              { nombre: 'IP después', valor: f.ipDespues === null ? '—' : F().decimal(f.ipDespues, 0) },
              { nombre: 'Variación', valor: f.variacion === null ? '—' : F().variacion(f.variacion) }
            ]);
          }
        },
        xAxis: global.Graficos.ejeCategorias(filas.map((f) => (f.nombre.length > 18 ? f.nombre.slice(0, 17) + '…' : f.nombre)), {
          axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, interval: 0, rotate: filas.length > 4 ? 25 : 0, hideOverlap: false }
        }),
        yAxis: global.Graficos.ejeValores(),
        series: [
          global.Graficos.barra('Antes', filas.map((f) => (f.ipAntes === null ? 0 : Math.round(f.ipAntes))), Datos.color('referencia')),
          global.Graficos.barra('Después', filas.map((f) => (f.ipDespues === null ? 0 : Math.round(f.ipDespues))), Datos.color('principal'))
        ]
      });
    },
    notas: function () {
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Es una comparación antes y después, no una prueba de causa: en el medio pasaron ' +
        'muchas otras cosas. Sirve para decidir dónde mirar con más detalle."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>El corte es el primer mes en que alguien hizo esa capacitación. El IP de cada tramo usa los ' +
        'meses activos de ese tramo, así que un cajero que no operó antes no arrastra un cero.</p></div>'
      );
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
