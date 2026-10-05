/* §7.3 Estructura de la red — láminas 8 a 13. */
(function (global) {
  'use strict';

  const SECCION = 'Estructura de la red';

  function F() {
    return global.Formato;
  }

  function vacio(host, lamina, detalle) {
    const cuerpo = UI.cabecera(host, lamina, 'No hay operaciones para mostrar.');
    cuerpo.appendChild(UI.vacio('Sin datos para este recorte', detalle || 'No hay operaciones en el período.'));
  }

  /* Celda de texto que no empuja el ancho de la tabla: recorta con elipsis y
     deja el texto completo en el title. */
  function textoCorto(texto, ancho) {
    const nodo = UI.elemento('span', null, texto);
    nodo.style.cssText =
      'display:inline-block;max-width:' + ancho + 'px;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom';
    nodo.title = texto;
    return nodo;
  }

  /* Punto de color + nombre: ocupa mucho menos que un chip y deja ver la
     columna completa dentro del ancho del panel. */
  function etiquetaJefe(jefe) {
    const Datos = global.Datos;
    const caja = UI.elemento('span');
    caja.style.cssText = 'display:inline-flex;align-items:center;gap:6px;white-space:nowrap';
    const punto = UI.elemento('span');
    punto.style.cssText =
      'width:8px;height:8px;border-radius:2px;flex-shrink:0;background:' + Datos.colorJefe(jefe);
    caja.appendChild(punto);
    caja.appendChild(textoCorto(Datos.jefe(jefe), 118));
    return caja;
  }

  function jefeDe(local) {
    return local >= 0 ? global.Datos.raw.dim.locales.jefe[local] : -1;
  }

  /* Resumen por jefe zonal: locales, cajeros y operaciones del recorte, con la
     composición completa de cada zona —qué localidades, qué locales y qué
     cajeros le pertenecen— para poder responder "¿de quién es esto?". */
  function porJefeZonal(ctx) {
    const Datos = global.Datos;
    const agg = ctx.porJefe();
    const locales = ctx.metricasLocales();
    const metricas = ctx.metricasCajeros();

    const porJefe = new Map();
    const asegurar = function (j) {
      if (!porJefe.has(j)) {
        porJefe.set(j, {
          jefe: j,
          nombre: Datos.jefe(j),
          ops: 0,
          locales: 0,
          localesActivos: 0,
          cajeros: 0,
          cajerosActivos: 0,
          localesAlto: 0,
          localesBajo: 0,
          cajerosAlto: 0,
          cajerosBajo: 0,
          listaLocales: [],
          listaCajeros: [],
          localidades: new Set(),
          provincias: new Set()
        });
      }
      return porJefe.get(j);
    };

    locales.forEach(function (l) {
      const fila = asegurar(l.jefe);
      fila.locales++;
      if (l.ops > 0) fila.localesActivos++;
      if (l.zona === 0) fila.localesAlto++;
      else fila.localesBajo++;
      fila.listaLocales.push(l);
      fila.localidades.add(l.localidad);
      if (l.provincia >= 0) fila.provincias.add(l.provincia);
    });

    metricas.forEach(function (m) {
      const local = m.local;
      const jefe = local >= 0 ? Datos.raw.dim.locales.jefe[local] : -1;
      const fila = asegurar(jefe);
      fila.cajeros++;
      if (m.activo) fila.cajerosActivos++;
      if (m.zona === 0) fila.cajerosAlto++;
      else fila.cajerosBajo++;
      fila.listaCajeros.push(m);
    });

    agg.forEach(function (a, j) {
      asegurar(j).ops += a.ops;
    });

    porJefe.forEach(function (fila) {
      fila.cajerosPorLocal = fila.locales > 0 ? fila.cajeros / fila.locales : 0;
      fila.opsPorCajero = fila.cajerosActivos > 0 ? fila.ops / fila.cajerosActivos : 0;
      fila.opsPorLocal = fila.localesActivos > 0 ? fila.ops / fila.localesActivos : 0;
      fila.cantidadLocalidades = fila.localidades.size;
      fila.cantidadProvincias = fila.provincias.size;
    });

    return Array.from(porJefe.values()).sort((a, b) => b.ops - a.ops);
  }

  /* Panel lateral con la composición de una zona: sus localidades, sus locales
     y sus cajeros. Es la respuesta a "¿qué le pertenece a este jefe zonal?". */
  function abrirComposicion(fila) {
    const Datos = global.Datos;
    const caja = UI.elemento('div', 'col');

    caja.appendChild(
      global.Navegacion.detalleFilas([
        { rotulo: 'Provincias', valor: F().entero(fila.cantidadProvincias) },
        { rotulo: 'Localidades', valor: F().entero(fila.cantidadLocalidades) },
        { rotulo: 'Locales', valor: F().entero(fila.locales) + ' (' + F().entero(fila.localesActivos) + ' con actividad)' },
        { rotulo: 'Cajeros', valor: F().entero(fila.cajeros) },
        { rotulo: 'Cajeros por local', valor: F().decimal(fila.cajerosPorLocal, 1) },
        { rotulo: 'Operaciones', valor: F().entero(fila.ops) }
      ])
    );

    const titulo = function (texto) {
      const nodo = UI.elemento('div', 'panel-titulo', texto);
      nodo.style.marginTop = '6px';
      nodo.style.borderTop = '1px solid var(--borde)';
      nodo.style.paddingTop = '8px';
      return nodo;
    };

    // Localidades de la zona, con cuántos locales tiene en cada una.
    const porLocalidad = new Map();
    fila.listaLocales.forEach(function (l) {
      if (!porLocalidad.has(l.localidad)) porLocalidad.set(l.localidad, { locales: 0, cajeros: 0, ops: 0 });
      const e = porLocalidad.get(l.localidad);
      e.locales++;
      e.cajeros += l.cajerosHabilitados;
      e.ops += l.ops;
    });
    caja.appendChild(titulo('Localidades'));
    Array.from(porLocalidad.entries())
      .sort((a, b) => b[1].ops - a[1].ops)
      .forEach(function (e) {
        const item = UI.elemento('div', 'dato-fila');
        item.appendChild(UI.elemento('span', 'rotulo', Datos.localidad(e[0])));
        item.appendChild(
          UI.elemento('span', 'valor', F().entero(e[1].locales) + (e[1].locales === 1 ? ' local' : ' locales'))
        );
        caja.appendChild(item);
      });

    caja.appendChild(titulo('Locales · ' + F().entero(fila.listaLocales.length)));
    fila.listaLocales
      .slice()
      .sort((a, b) => b.ops - a.ops)
      .forEach(function (l) {
        const item = UI.elemento('div', 'dato-fila');
        const izq = UI.elemento('span', 'rotulo', l.nombre);
        izq.style.cursor = 'pointer';
        izq.onclick = function () {
          global.Filtros.alternar('locales', l.local);
        };
        item.appendChild(izq);
        item.appendChild(
          UI.elemento('span', 'valor', F().entero(l.cajerosHabilitados) + ' cajeros · ' + F().compacto(l.ops))
        );
        caja.appendChild(item);
      });

    caja.appendChild(titulo('Cajeros · ' + F().entero(fila.listaCajeros.length)));
    fila.listaCajeros
      .slice()
      .sort((a, b) => b.ops - a.ops)
      .forEach(function (m) {
        const item = UI.elemento('div', 'dato-fila');
        item.appendChild(UI.elemento('span', 'rotulo', Datos.cajero(m.cajero)));
        item.appendChild(UI.elemento('span', 'valor', Datos.local(m.local)));
        caja.appendChild(item);
      });

    global.Navegacion.abrirDetalle(
      fila.nombre,
      F().entero(fila.locales) + ' locales · ' + F().entero(fila.cajeros) + ' cajeros · ' +
      F().entero(fila.cantidadLocalidades) + ' localidades',
      caja
    );
  }

  /* Resumen por localidad, separando las de alto y bajo movimiento. */
  function porLocalidad(ctx) {
    const Datos = global.Datos;
    const locales = ctx.metricasLocales();
    const mapa = new Map();
    locales.forEach(function (l) {
      if (!mapa.has(l.localidad)) {
        mapa.set(l.localidad, {
          localidad: l.localidad,
          nombre: Datos.localidad(l.localidad),
          zona: l.zona,
          ops: 0,
          locales: 0,
          cajeros: 0,
          sumaIp: 0,
          conIp: 0
        });
      }
      const fila = mapa.get(l.localidad);
      fila.ops += l.ops;
      fila.locales++;
      fila.cajeros += l.cajerosHabilitados;
      if (l.ipPromedio !== null) {
        fila.sumaIp += l.ipPromedio * l.cajerosConDatos;
        fila.conIp += l.cajerosConDatos;
      }
    });
    const salida = Array.from(mapa.values());
    salida.forEach(function (f) {
      f.ip = f.conIp > 0 ? f.sumaIp / f.conIp : null;
    });
    return salida;
  }

  // ------------------------------------------------------------ Lámina 8

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Red por jefe zonal',
    subtitulo: 'Cuántos locales y cuántos cajeros tiene cada zona, y cuánta gente hay por local.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const filas = porJefeZonal(ctx);
      const totalLocales = filas.reduce((a, f) => a + f.locales, 0);
      const totalCajeros = filas.reduce((a, f) => a + f.cajeros, 0);
      const mayor = filas.slice().sort((a, b) => b.locales - a.locales)[0];

      const linea =
        'La red tiene <strong>' + F().entero(totalLocales) + '</strong> locales y <strong>' +
        F().entero(totalCajeros) + '</strong> cajeros repartidos en <strong>' + filas.length + '</strong> zonas; ' +
        'la más grande es <strong>' + mayor.nombre + '</strong>, con ' + F().entero(mayor.locales) + ' locales y ' +
        F().decimal(mayor.cajerosPorLocal, 1) + ' cajeros por local.';

      const cuerpo = UI.cabecera(host, this, linea);
      const fila = UI.fila(true);

      const panel = UI.panel('Locales y cajeros por zona');
      panel.style.flex = '1 1 0';
      const caja = UI.grafico(panel);
      fila.appendChild(panel);

      const panelTabla = UI.panel('Qué le pertenece a cada zona');
      panelTabla.style.flex = '1 1 0';
      panelTabla.appendChild(
        UI.tabla({
          ordenPor: 'ops',
          columnas: [
            { titulo: 'Jefe zonal', clave: 'nombre', num: false },
            { titulo: 'Prov.', clave: 'cantidadProvincias', num: true, ayuda: 'Provincias en las que tiene locales', render: (f) => F().entero(f.cantidadProvincias) },
            { titulo: 'Localidades', clave: 'cantidadLocalidades', num: true, render: (f) => F().entero(f.cantidadLocalidades) },
            { titulo: 'Locales', clave: 'locales', num: true, render: (f) => F().entero(f.locales) },
            { titulo: 'Cajeros', clave: 'cajeros', num: true, render: (f) => F().entero(f.cajeros) },
            { titulo: 'Cajeros/local', clave: 'cajerosPorLocal', num: true, render: (f) => F().decimal(f.cajerosPorLocal, 1) },
            { titulo: 'Operaciones', clave: 'ops', num: true, render: (f) => F().compacto(f.ops) }
          ],
          filas: filas
        })
      );
      fila.appendChild(panelTabla);
      cuerpo.appendChild(fila);

      const instancia = global.Graficos.crear(caja, {
        legend: { data: ['Locales', 'Cajeros'] },
        grid: { left: 8, right: 14, top: 30, bottom: 4, containLabel: true },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: function (params) {
            const f = filas[params[0].dataIndex];
            return global.Graficos.tooltipFilas(f.nombre, [
              { nombre: 'Locales', valor: F().entero(f.locales) },
              { nombre: 'Cajeros', valor: F().entero(f.cajeros) },
              { nombre: 'Cajeros por local', valor: F().decimal(f.cajerosPorLocal, 1) },
              { nombre: 'Operaciones', valor: F().entero(f.ops) }
            ]);
          }
        },
        xAxis: global.Graficos.ejeCategorias(filas.map((f) => f.nombre), {
          axisLabel: { color: global.Graficos.colorTexto, fontSize: global.Graficos.fuenteChica, interval: 0, rotate: filas.length > 6 ? 30 : 0, hideOverlap: false }
        }),
        yAxis: global.Graficos.ejeValores(),
        series: [
          global.Graficos.barra('Locales', filas.map((f) => f.locales), Datos.color('principal')),
          global.Graficos.barra('Cajeros', filas.map((f) => f.cajeros), Datos.color('secundaria'))
        ]
      });
      instancia.on('click', function (p) {
        global.Filtros.alternar('jefes', filas[p.dataIndex].jefe);
      });
    },
    notas: function (ctx) {
      const filas = porJefeZonal(ctx);
      const ordenadas = filas.slice().sort((a, b) => b.cajerosPorLocal - a.cajerosPorLocal);
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Las zonas no son comparables en tamaño. Antes de mirar productividad conviene ' +
        'tener presente con cuántos locales y cuánta gente juega cada uno."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>Cajeros por local es la densidad de la zona: un número alto puede ser un local grande, ' +
        'o varios cajeros compartiendo poco volumen. Se cruza con la lámina de operaciones promedio.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Más densa: <span class="dato">' + ordenadas[0].nombre + '</span> (' + F().decimal(ordenadas[0].cajerosPorLocal, 1) + ' por local)</li>' +
        '<li>Menos densa: <span class="dato">' + ordenadas[ordenadas.length - 1].nombre + '</span> (' +
        F().decimal(ordenadas[ordenadas.length - 1].cajerosPorLocal, 1) + ')</li>' +
        '<li>Zonas en el recorte: <span class="dato">' + filas.length + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // --------------------------------------------------- Lámina de pertenencia

  /* Tabla con buscador: filtra en memoria, sin tocar los filtros globales. */
  function tablaBuscable(panel, opciones) {
    const buscador = UI.elemento('input', 'control no-imprimir');
    buscador.type = 'search';
    buscador.placeholder = opciones.placeholder;
    buscador.style.cssText = 'max-width:100%;margin-bottom:6px;flex-shrink:0';
    panel.appendChild(buscador);

    const contenedor = UI.elemento('div');
    contenedor.style.cssText = 'flex-grow:1;min-height:0;display:flex;flex-direction:column';
    panel.appendChild(contenedor);

    const pintar = function () {
      const texto = buscador.value.trim().toLowerCase();
      const filas = texto
        ? opciones.filas.filter((f) => opciones.buscarEn(f).toLowerCase().includes(texto))
        : opciones.filas;
      const rotulo = panel.querySelector('.panel-titulo .aclaracion');
      if (rotulo) rotulo.textContent = F().entero(filas.length) + ' de ' + F().entero(opciones.filas.length);
      contenedor.innerHTML = '';
      contenedor.appendChild(
        UI.tabla({ columnas: opciones.columnas, filas: filas, ordenPor: opciones.ordenPor, alClic: opciones.alClic })
      );
    };

    let temporizador = null;
    buscador.oninput = function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(pintar, 120);
    };
    pintar();
  }

  global.Navegacion.registrar({
    seccion: 'Anexo',
    titulo: 'Quién pertenece a cada zona',
    subtitulo: 'Buscador de locales y de cajeros para saber, en el momento, de qué jefe zonal es cada uno.',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const locales = ctx.metricasLocales();
      const cajeros = ctx.metricasCajeros();
      const jefes = new Set(locales.map((l) => l.jefe));

      const linea =
        '<strong>' + F().entero(locales.length) + '</strong> locales y <strong>' + F().entero(cajeros.length) +
        '</strong> cajeros repartidos entre <strong>' + F().entero(jefes.size) + '</strong> jefes zonales: ' +
        'buscá por nombre para ver a quién pertenece cada uno.';

      const cuerpo = UI.cabecera(host, this, linea);
      const fila = UI.fila(true);

      const panelLocales = UI.panel('Locales', '');
      panelLocales.style.flex = '1 1 0';
      tablaBuscable(panelLocales, {
        placeholder: 'Buscar local, localidad o jefe zonal…',
        filas: locales,
        ordenPor: 'nombre',
        buscarEn: (l) => l.nombre + ' ' + Datos.idLocal(l.local) + ' ' + Datos.localidad(l.localidad) + ' ' + Datos.jefe(l.jefe),
        columnas: [
          { titulo: 'Local', clave: 'nombre', num: false, render: (l) => textoCorto(l.nombre, 168) },
          { titulo: 'Localidad', num: false, render: (l) => textoCorto(Datos.localidad(l.localidad), 118) },
          { titulo: 'Jefe zonal', num: false, render: (l) => etiquetaJefe(l.jefe) },
          { titulo: 'Cajeros', clave: 'cajerosHabilitados', num: true, render: (l) => F().entero(l.cajerosHabilitados) }
        ],
        alClic: function (l) {
          global.Filtros.alternar('locales', l.local);
        }
      });
      fila.appendChild(panelLocales);

      const panelCajeros = UI.panel('Cajeros', '');
      panelCajeros.style.flex = '1 1 0';
      tablaBuscable(panelCajeros, {
        placeholder: 'Buscar cajero, legajo, local o jefe zonal…',
        filas: cajeros,
        ordenPor: 'ops',
        buscarEn: function (m) {
          return Datos.cajero(m.cajero) + ' ' + Datos.idCajero(m.cajero) + ' ' + Datos.local(m.local) + ' ' + Datos.jefe(jefeDe(m.local));
        },
        columnas: [
          { titulo: 'Cajero', clave: 'nombre', num: false, render: (m) => textoCorto(Datos.cajero(m.cajero), 150) },
          { titulo: 'Local', num: false, render: (m) => textoCorto(Datos.local(m.local), 158) },
          { titulo: 'Jefe zonal', num: false, render: (m) => etiquetaJefe(jefeDe(m.local)) }
        ],
        alClic: function (m) {
          const jefe = jefeDe(m.local);
          global.Navegacion.abrirDetalle(
            Datos.cajero(m.cajero),
            Datos.local(m.local) + ' · ' + Datos.jefe(jefe),
            global.Navegacion.detalleFilas([
              { rotulo: 'Legajo', valor: Datos.idCajero(m.cajero) },
              { rotulo: 'Local', valor: Datos.local(m.local) },
              { rotulo: 'Localidad', valor: Datos.localidad(Datos.raw.dim.locales.localidad[m.local]) },
              { rotulo: 'Jefe zonal', valor: Datos.jefe(jefe) },
              { rotulo: 'Tipo de zona', valor: Datos.zona(m.zona) },
              { separador: true },
              { rotulo: 'Operaciones', valor: F().entero(m.ops) },
              { rotulo: 'Meses activos', valor: F().entero(m.mesesActivos) },
              { rotulo: 'Categoría', nodo: UI.etiquetaCategoria(m.categoria) }
            ])
          );
        }
      });
      fila.appendChild(panelCajeros);

      cuerpo.appendChild(fila);
    },
    notas: function (ctx) {
      if (ctx.vacio) return '';
      const Datos = global.Datos;
      const locales = ctx.metricasLocales();
      const cajeros = ctx.metricasCajeros();
      const filas = porJefeZonal(ctx);
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Si en la reunión aparece un local o un cajero y no está claro de quién es, ' +
        'esta es la lámina: se busca por nombre y aparece su jefe zonal."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>El color de la etiqueta de jefe zonal es el mismo que usa esa zona en todos los gráficos ' +
        'de la presentación, así que se puede seguir el rastro de una zona lámina a lámina.</p>' +
        '<p>Un cajero puede haber operado en locales de más de una zona; acá figura el local ' +
        'de su período más reciente. Clic en una fila abre su detalle.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Locales: <span class="dato">' + F().entero(locales.length) + '</span></li>' +
        '<li>Cajeros: <span class="dato">' + F().entero(cajeros.length) + '</span></li>' +
        filas.slice(0, 3).map(function (f) {
          return '<li>' + f.nombre + ': <span class="dato">' + F().entero(f.locales) + '</span> locales, ' +
            F().entero(f.cajeros) + ' cajeros</li>';
        }).join('') +
        '</ul></div>'
      );
    }
  });

  // ----------------------------------------------------------- Lámina 13

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Mapa de locales',
    subtitulo: 'Cada punto es un local: el tamaño son sus operaciones y el color, su tipo de zona.',
    requiere: 'coordenadas',
    render: function (host, ctx) {
      if (ctx.vacio) return vacio(host, this);
      const Datos = global.Datos;
      const raw = Datos.raw;
      const filas = ctx.metricasLocales().filter(function (l) {
        return raw.dim.locales.lat[l.local] !== null && raw.dim.locales.lon[l.local] !== null;
      });
      if (!filas.length) return vacio(host, this, 'Ningún local del recorte tiene coordenadas cargadas.');

      const conCoordenadas = filas.length;
      const total = ctx.metricasLocales().length;
      const linea =
        '<strong>' + F().entero(conCoordenadas) + '</strong> de los ' + F().entero(total) + ' locales del recorte tienen ' +
        'coordenadas; el tamaño del punto es su volumen de operaciones y el color, el tipo de zona.';

      const cuerpo = UI.cabecera(host, this, linea);
      const panel = UI.panel('Locales', 'proyección simple de longitud y latitud, sin mapa en línea');
      panel.style.flexGrow = '1';
      const caja = UI.grafico(panel);
      cuerpo.appendChild(panel);

      const maximo = Math.max.apply(null, filas.map((f) => f.ops)) || 1;

      const instancia = global.Graficos.crear(caja, {
        legend: { data: [Datos.zona(0), Datos.zona(1)] },
        grid: { left: 10, right: 14, top: 30, bottom: 6, containLabel: true },
        tooltip: {
          formatter: function (p) {
            const f = p.data.fila;
            return global.Graficos.tooltipFilas(f.nombre, [
              { nombre: 'Jefe zonal', valor: Datos.jefe(f.jefe) },
              { nombre: 'Localidad', valor: Datos.localidad(f.localidad) },
              { nombre: 'Tipo de zona', valor: Datos.zona(f.zona) },
              { nombre: 'Operaciones', valor: F().entero(f.ops) },
              { nombre: 'Cajeros', valor: F().entero(f.cajerosHabilitados) }
            ]);
          }
        },
        xAxis: { type: 'value', scale: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { lineStyle: { color: global.Graficos.colorGrilla, type: 'dashed' } } },
        yAxis: { type: 'value', scale: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { lineStyle: { color: global.Graficos.colorGrilla, type: 'dashed' } } },
        series: [0, 1].map(function (zona) {
          return {
            name: Datos.zona(zona),
            type: 'scatter',
            data: filas
              .filter((f) => f.zona === zona)
              .map(function (f) {
                return {
                  value: [raw.dim.locales.lon[f.local], raw.dim.locales.lat[f.local]],
                  fila: f,
                  symbolSize: 8 + Math.sqrt(f.ops / maximo) * 26
                };
              }),
            itemStyle: { color: Datos.colorZona(zona), opacity: 0.82, borderColor: '#0f121d', borderWidth: 1 },
            emphasis: { itemStyle: { borderColor: '#fff', borderWidth: 2 } }
          };
        })
      });
      instancia.on('click', function (p) {
        if (p.data && p.data.fila) global.Filtros.alternar('locales', p.data.fila.local);
      });
    },
    notas: function (ctx) {
      const raw = global.Datos.raw;
      const filas = ctx.metricasLocales();
      const con = filas.filter((l) => raw.dim.locales.lat[l.local] !== null).length;
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"La geografía explica parte de la diferencia de volumen: los locales grandes ' +
        'se agrupan, y los de bajo movimiento suelen estar dispersos."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>No es un mapa con calles: son las coordenadas proyectadas sobre dos ejes, sin conexión a internet. ' +
        'Sirve para ver agrupamientos y distancias relativas, no para ubicar una dirección.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Locales con coordenadas: <span class="dato">' + F().entero(con) + '</span> de ' + F().entero(filas.length) + '</li>' +
        '</ul></div>'
      );
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
