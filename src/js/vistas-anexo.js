/* §7.8 Anexo — láminas 36 y 37: las tablas completas, con buscador y descarga. */
(function (global) {
  'use strict';

  const SECCION = 'Anexo';

  function F() {
    return global.Formato;
  }

  function jefeDe(local) {
    return local >= 0 ? global.Datos.raw.dim.locales.jefe[local] : -1;
  }

  /* Buscador + tabla que se repinta en memoria, sin tocar los filtros globales. */
  function panelConBuscador(opciones) {
    const panel = UI.panel(opciones.titulo, opciones.aclaracion);
    panel.style.flexGrow = '1';

    const barra = UI.elemento('div');
    barra.style.cssText = 'display:flex;gap:7px;align-items:center;margin-bottom:6px;flex-shrink:0';

    const buscador = UI.elemento('input', 'control no-imprimir');
    buscador.type = 'search';
    buscador.placeholder = opciones.placeholder || 'Buscar…';
    buscador.style.maxWidth = '280px';
    barra.appendChild(buscador);

    const contador = UI.elemento('span', 'tenue');
    contador.style.fontSize = '11.5px';
    barra.appendChild(contador);

    const espacio = UI.elemento('div');
    espacio.style.marginLeft = 'auto';
    barra.appendChild(espacio);

    barra.appendChild(
      UI.botonCsv('Descargar CSV', function () {
        opciones.descargar(filtradas());
      })
    );
    panel.appendChild(barra);

    const contenedor = UI.elemento('div');
    contenedor.style.cssText = 'flex-grow:1;min-height:0;display:flex;flex-direction:column';
    panel.appendChild(contenedor);

    function filtradas() {
      const texto = buscador.value.trim().toLowerCase();
      if (!texto) return opciones.filas;
      return opciones.filas.filter(function (f) {
        return opciones.buscarEn(f).toLowerCase().includes(texto);
      });
    }

    function pintar() {
      const filas = filtradas();
      contador.textContent = F().entero(filas.length) + ' de ' + F().entero(opciones.filas.length);
      contenedor.innerHTML = '';
      contenedor.appendChild(
        UI.tabla({
          columnas: opciones.columnas,
          filas: filas,
          ordenPor: opciones.ordenPor,
          alClic: opciones.alClic
        })
      );
    }

    let temporizador = null;
    buscador.oninput = function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(pintar, 120);
    };
    pintar();
    return panel;
  }

  // ----------------------------------------------------------- Lámina 36

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Tabla de cajeros',
    subtitulo: 'Todas las métricas por cajero, con buscador, orden por columna y descarga.',
    render: function (host, ctx) {
      const Datos = global.Datos;
      const metricas = ctx.metricasCajeros();
      if (!metricas.length) {
        const vacioCuerpo = UI.cabecera(host, this, 'No hay cajeros con los filtros seleccionados.');
        vacioCuerpo.appendChild(UI.vacio('Sin datos para este recorte', 'Ningún cajero cumple con todos los filtros activos.'));
        return;
      }

      const linea =
        '<strong>' + F().entero(metricas.length) + '</strong> cajeros en el recorte, ' +
        '<strong>' + F().entero(metricas.filter((m) => m.suficiente).length) + '</strong> con datos suficientes para recibir categoría.';

      const cuerpo = UI.cabecera(host, this, linea);

      cuerpo.appendChild(
        panelConBuscador({
          titulo: 'Cajeros',
          aclaracion: 'clic en una fila para ver el detalle',
          placeholder: 'Buscar cajero, local o zona…',
          filas: metricas,
          ordenPor: 'ops',
          buscarEn: function (m) {
            return Datos.cajero(m.cajero) + ' ' + Datos.idCajero(m.cajero) + ' ' + Datos.local(m.local) + ' ' + Datos.jefe(jefeDe(m.local));
          },
          columnas: [
            { titulo: 'Cajero', clave: 'nombre', num: false, render: (m) => Datos.cajero(m.cajero) },
            { titulo: 'Local', num: false, render: (m) => Datos.local(m.local) },
            { titulo: 'Jefe zonal', num: false, render: (m) => Datos.jefe(jefeDe(m.local)) },
            { titulo: 'Zona', num: false, render: (m) => Datos.zona(m.zona) },
            { titulo: 'Ops.', clave: 'ops', num: true, render: (m) => F().entero(m.ops) },
            { titulo: 'Meses act.', clave: 'mesesActivos', num: true, render: (m) => F().entero(m.mesesActivos) },
            { titulo: '% meses', clave: 'porcentajeMesesActivos', num: true, render: (m) => F().porcentaje(m.porcentajeMesesActivos, 0) },
            { titulo: 'IP', clave: 'ip', num: true, ayuda: 'Operaciones por mes activo', render: (m) => (m.suficiente ? F().decimal(m.ip, 0) : '—') },
            { titulo: 'Percentil', clave: 'percentil', num: true, render: (m) => (m.suficiente ? F().decimal(m.percentil, 0) : '—') },
            {
              titulo: 'Categoría',
              clave: 'categoria',
              num: false,
              render: function (m) {
                const caja = UI.elemento('span');
                caja.appendChild(UI.etiquetaCategoria(m.categoria));
                return caja;
              }
            }
          ],
          alClic: function (m) {
            global.Navegacion.abrirDetalle(
              Datos.cajero(m.cajero),
              Datos.local(m.local) + ' · ' + Datos.jefe(jefeDe(m.local)),
              global.Navegacion.detalleFilas([
                { rotulo: 'Legajo', valor: Datos.idCajero(m.cajero) },
                { rotulo: 'Tipo de zona', valor: Datos.zona(m.zona) },
                { separador: true },
                { rotulo: 'Operaciones', valor: F().entero(m.ops) },
                { rotulo: 'Meses activos', valor: F().entero(m.mesesActivos) + ' de ' + F().entero(m.mesesHabilitado) },
                { rotulo: 'IP', valor: m.suficiente ? F().decimal(m.ip, 0) : 'sin datos suficientes' },
                { rotulo: 'Percentil en su zona', valor: m.suficiente ? F().decimal(m.percentil, 0) : '—' },
                { rotulo: 'Categoría', nodo: UI.etiquetaCategoria(m.categoria) }
              ])
            );
          },
          descargar: function (filas) {
            Datos.descargarCsv(
              'cajeros.csv',
              ['Legajo', 'Cajero', 'Local', 'Jefe zonal', 'Tipo de zona', 'Operaciones', 'Meses activos', 'Meses habilitado', '% meses activos', 'IP', 'Percentil', 'Categoria'],
              filas.map(function (m) {
                return [
                  Datos.idCajero(m.cajero),
                  Datos.cajero(m.cajero),
                  Datos.local(m.local),
                  Datos.jefe(jefeDe(m.local)),
                  Datos.zona(m.zona),
                  m.ops,
                  m.mesesActivos,
                  m.mesesHabilitado,
                  Datos.numeroCsv(m.porcentajeMesesActivos, 1),
                  m.suficiente ? Datos.numeroCsv(m.ip, 2) : '',
                  m.suficiente ? Datos.numeroCsv(m.percentil, 1) : '',
                  Datos.categoria(m.categoria)
                ];
              })
            );
          }
        })
      );
    },
    notas: function (ctx) {
      const metricas = ctx.metricasCajeros();
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Si alguien pregunta por un cajero puntual, está acá. Es la misma información ' +
        'que alimenta todas las láminas anteriores."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>El buscador filtra por nombre, legajo, local o jefe zonal, y la descarga respeta lo que se está ' +
        'viendo: filtros globales más lo que se haya escrito en el buscador.</p>' +
        '<p>Si en la barra de arriba se eligió «Solo ID», la columna de cajero muestra el legajo: ' +
        'sirve para compartir la tabla sin datos nominales.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Cajeros: <span class="dato">' + F().entero(metricas.length) + '</span></li>' +
        '<li>Con categoría: <span class="dato">' + F().entero(metricas.filter((m) => m.suficiente).length) + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // ----------------------------------------------------------- Lámina 37

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Tabla de locales',
    subtitulo: 'Todas las métricas por local, con buscador, orden por columna y descarga.',
    render: function (host, ctx) {
      const Datos = global.Datos;
      const locales = ctx.metricasLocales();
      if (!locales.length) {
        const vacioCuerpo = UI.cabecera(host, this, 'No hay locales con los filtros seleccionados.');
        vacioCuerpo.appendChild(UI.vacio('Sin datos para este recorte', 'Ningún local cumple con todos los filtros activos.'));
        return;
      }

      const activos = locales.filter((l) => l.ops > 0).length;
      const linea =
        '<strong>' + F().entero(locales.length) + '</strong> locales en el recorte, ' +
        '<strong>' + F().entero(activos) + '</strong> con operaciones en el período.';

      const cuerpo = UI.cabecera(host, this, linea);

      cuerpo.appendChild(
        panelConBuscador({
          titulo: 'Locales',
          aclaracion: 'clic en una fila para ver el detalle',
          placeholder: 'Buscar local, localidad o zona…',
          filas: locales,
          ordenPor: 'ops',
          buscarEn: function (l) {
            return l.nombre + ' ' + Datos.idLocal(l.local) + ' ' + Datos.localidad(l.localidad) + ' ' + Datos.jefe(l.jefe);
          },
          columnas: [
            { titulo: 'Local', clave: 'nombre', num: false },
            { titulo: 'Localidad', num: false, render: (l) => Datos.localidad(l.localidad) },
            { titulo: 'Jefe zonal', num: false, render: (l) => Datos.jefe(l.jefe) },
            { titulo: 'Zona', num: false, render: (l) => Datos.zona(l.zona) },
            { titulo: 'Ops.', clave: 'ops', num: true, render: (l) => F().entero(l.ops) },
            { titulo: 'Cajeros', clave: 'cajerosHabilitados', num: true, render: (l) => F().entero(l.cajerosHabilitados) },
            { titulo: 'Con act.', clave: 'cajerosActivos', num: true, render: (l) => F().entero(l.cajerosActivos) },
            { titulo: '% sin act.', clave: 'porcentajeInactivos', num: true, render: (l) => F().porcentaje(l.porcentajeInactivos, 0) },
            { titulo: 'Ops./cajero', clave: 'opsPorCajero', num: true, render: (l) => F().entero(Math.round(l.opsPorCajero)) },
            { titulo: 'IP prom.', clave: 'ipPromedio', num: true, render: (l) => (l.ipPromedio === null ? '—' : F().decimal(l.ipPromedio, 0)) },
            {
              titulo: 'Categoría',
              clave: 'categoria',
              num: false,
              render: function (l) {
                const caja = UI.elemento('span');
                caja.appendChild(UI.etiquetaCategoria(l.categoria));
                return caja;
              }
            }
          ],
          alClic: function (l) {
            global.Navegacion.abrirDetalle(
              l.nombre,
              Datos.localidad(l.localidad) + ' · ' + Datos.jefe(l.jefe),
              global.Navegacion.detalleFilas([
                { rotulo: 'Id local', valor: Datos.idLocal(l.local) },
                { rotulo: 'Provincia', valor: Datos.provincia(l.provincia) },
                { rotulo: 'Tipo de zona', valor: Datos.zona(l.zona) },
                { separador: true },
                { rotulo: 'Operaciones', valor: F().entero(l.ops) },
                { rotulo: 'Cajeros habilitados', valor: F().entero(l.cajerosHabilitados) },
                { rotulo: 'Con actividad', valor: F().entero(l.cajerosActivos) },
                { rotulo: 'Sin actividad', valor: F().porcentaje(l.porcentajeInactivos) },
                { rotulo: 'Operaciones por cajero', valor: F().entero(Math.round(l.opsPorCajero)) },
                { rotulo: 'IP promedio', valor: l.ipPromedio === null ? '—' : F().decimal(l.ipPromedio, 0) },
                { rotulo: 'Categoría del local', nodo: UI.etiquetaCategoria(l.categoria) }
              ])
            );
          },
          descargar: function (filas) {
            Datos.descargarCsv(
              'locales.csv',
              ['Id local', 'Local', 'Localidad', 'Provincia', 'Jefe zonal', 'Tipo de zona', 'Operaciones', 'Cajeros habilitados', 'Cajeros con actividad', '% sin actividad', 'Operaciones por cajero', 'IP promedio', 'Categoria'],
              filas.map(function (l) {
                return [
                  Datos.idLocal(l.local),
                  l.nombre,
                  Datos.localidad(l.localidad),
                  Datos.provincia(l.provincia),
                  Datos.jefe(l.jefe),
                  Datos.zona(l.zona),
                  l.ops,
                  l.cajerosHabilitados,
                  l.cajerosActivos,
                  Datos.numeroCsv(l.porcentajeInactivos, 1),
                  Math.round(l.opsPorCajero),
                  l.ipPromedio === null ? '' : Datos.numeroCsv(l.ipPromedio, 2),
                  Datos.categoria(l.categoria)
                ];
              })
            );
          }
        })
      );
    },
    notas: function (ctx) {
      const locales = ctx.metricasLocales();
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Misma idea que la tabla de cajeros, pero por local. Es la que conviene descargar ' +
        'para trabajar la zona después de la reunión."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>La categoría del local compara su IP promedio contra los locales de su mismo tipo de zona, ' +
        'con los mismos cortes por tercios que se usan para los cajeros.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Locales: <span class="dato">' + F().entero(locales.length) + '</span></li>' +
        '<li>Con operaciones: <span class="dato">' + F().entero(locales.filter((l) => l.ops > 0).length) + '</span></li>' +
        '</ul></div>'
      );
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
