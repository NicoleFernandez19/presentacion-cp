/* §7.7 Cierre — láminas 34 y 35. */
(function (global) {
  'use strict';

  const SECCION = 'Cierre';

  function F() {
    return global.Formato;
  }

  function jefeDe(local) {
    return local >= 0 ? global.Datos.raw.dim.locales.jefe[local] : -1;
  }

  function textoDe(jefe) {
    const textos = global.Datos.raw.textos || [];
    return textos.find((t) => t.jefe === jefe) || null;
  }

  /* Resumen calculado por zona: lo que se dice de cada jefe zonal sale de acá,
     no de un texto escrito a mano. */
  function resumenPorZona(ctx) {
    const Datos = global.Datos;
    const motor = global.Filtros.motor;
    const metricas = ctx.metricasCajeros();

    const porJefe = new Map();
    metricas.forEach(function (m) {
      const j = jefeDe(m.local);
      if (!porJefe.has(j)) porJefe.set(j, { jefe: j, nombre: Datos.jefe(j), alta: 0, conCategoria: 0, cajeros: 0 });
      const f = porJefe.get(j);
      f.cajeros++;
      if (m.categoria !== 'sin_datos') {
        f.conCategoria++;
        if (m.categoria === 'alta') f.alta++;
      }
    });

    ctx.porJefe().forEach(function (a, j) {
      if (porJefe.has(j)) porJefe.get(j).ops = a.ops;
    });

    const trimestres = motor.trimestresCompletos(ctx.periodos);
    const comparar = global.Datos.hay('anio_anterior');

    const filas = Array.from(porJefe.values()).map(function (f) {
      const estadoJefe = Object.assign({}, global.Filtros.estado, { jefes: [f.jefe] });
      const ctxJefe = motor.contexto(estadoJefe);
      const dotacion = ctxJefe.dotacion();

      let variacion = null;
      if (comparar) {
        const comp = motor.comparativoAnual(estadoJefe);
        variacion = comp ? comp.variacionOps : null;
      } else if (trimestres.length >= 2) {
        // Sin año anterior, la variación del año es el primer trimestre contra el último.
        const inicio = motor.contexto(
          Object.assign({}, estadoJefe, { periodo: { modo: 'rango', desde: trimestres[0].periodos[0], hasta: trimestres[0].periodos[2] } })
        ).totales().ops;
        const fin = motor.contexto(
          Object.assign({}, estadoJefe, {
            periodo: {
              modo: 'rango',
              desde: trimestres[trimestres.length - 1].periodos[0],
              hasta: trimestres[trimestres.length - 1].periodos[2]
            }
          })
        ).totales().ops;
        variacion = inicio > 0 ? ((fin - inicio) / inicio) * 100 : null;
      }

      return Object.assign(f, {
        ops: f.ops || 0,
        porcentajeAlta: f.conCategoria ? (f.alta / f.conCategoria) * 100 : 0,
        porcentajeInactivos: dotacion.porcentajeInactivos,
        habilitados: dotacion.habilitadosPromedio,
        operadores: dotacion.activosPromedio,
        variacion: variacion
      });
    });

    const orden = filas.slice().sort((a, b) => b.porcentajeAlta - a.porcentajeAlta);
    orden.forEach(function (f, i) {
      f.posicion = i + 1;
    });
    return { filas: filas.sort((a, b) => b.ops - a.ops), total: filas.length, baseVariacion: comparar ? 'interanual' : 'primer contra último trimestre' };
  }

  function variacionNodo(valor) {
    if (valor === null || valor === undefined) return UI.elemento('span', 'variacion neutra', '—');
    const clase = valor > 0.5 ? 'sube' : valor < -0.5 ? 'baja' : 'neutra';
    return UI.elemento('span', 'variacion ' + clase, (valor > 0.5 ? '▲ ' : valor < -0.5 ? '▼ ' : '') + F().variacion(valor));
  }

  /* Tabla de zonas del cierre: la usan «Hallazgos por zona» y, si hace falta,
     otras láminas. Las filas se estiran para llenar el panel. */
  function tablaZonas(ctx, filas, baseVariacion) {
    const Datos = global.Datos;
    const avance = new Map();
    ctx.avancePorJefe().filas.forEach(function (f) {
      if (f.varOpsPorOperador !== null && f.varOpsPorOperador !== undefined) avance.set(f.jefe, f.varOpsPorOperador);
    });
    const caja = UI.tabla({
      columnas: [
        { titulo: '#', num: true, render: (f, i) => UI.elemento('span', 'posicion' + (i < 3 ? ' podio' : ''), String(i + 1)) },
        {
          titulo: 'Jefe zonal',
          num: false,
          render: function (f) {
            const celda = UI.elemento('span');
            celda.style.cssText = 'display:inline-flex;align-items:center;gap:8px;font-weight:700;color:#fff';
            const punto = UI.elemento('span');
            punto.style.cssText = 'width:10px;height:10px;border-radius:3px;background:' + Datos.colorJefe(f.jefe);
            celda.appendChild(punto);
            celda.appendChild(document.createTextNode(f.nombre));
            return celda;
          }
        },
        { titulo: 'Operaciones', num: true, render: (f) => F().compacto(f.ops) },
        { titulo: 'Variación', num: true, ayuda: 'Variación ' + baseVariacion + ' de las operaciones', render: (f) => variacionNodo(f.variacion) },
        {
          titulo: 'Avance',
          num: true,
          ayuda: 'Operaciones por operador, ventana final contra inicial',
          render: (f) => variacionNodo(avance.has(f.jefe) ? avance.get(f.jefe) : null)
        },
        { titulo: 'En ' + Datos.categoria('alta'), num: true, render: (f) => F().porcentaje(f.porcentajeAlta, 0) },
        { titulo: 'Operadores/mes', num: true, render: (f) => F().entero(Math.round(f.operadores)) }
      ],
      filas: filas
    });
    const tabla = caja.querySelector('table');
    if (tabla) tabla.style.cssText = 'height:100%;font-size:15px';
    return caja;
  }

  // ----------------------------------------------------------- Lámina 34

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Hallazgos por zona',
    subtitulo: 'Cómo termina cada jefe zonal: sus números del año en una tabla y, si está cargado, el texto de cierre.',
    render: function (host, ctx) {
      const Datos = global.Datos;
      if (ctx.vacio) {
        const vacioCuerpo = UI.cabecera(host, this, 'No hay datos para mostrar.');
        vacioCuerpo.appendChild(UI.vacio('Sin datos para este recorte', 'No hay operaciones en el período.'));
        return;
      }

      const resumen = resumenPorZona(ctx);
      const filas = resumen.filas;
      const mejor = filas.slice().sort((a, b) => b.porcentajeAlta - a.porcentajeAlta)[0];

      const linea =
        '<strong>' + mejor.nombre + '</strong> cierra el período con la mayor proporción de cajeros en ' +
        Datos.categoria('alta').toLowerCase() + ' (<strong>' + F().porcentaje(mejor.porcentajeAlta) + '</strong>); ' +
        'la variación que se muestra es ' + resumen.baseVariacion + '.';

      const peor = filas.slice().sort((a, b) => a.porcentajeAlta - b.porcentajeAlta)[0];
      if (filas.length > 1) {
        this.tituloActual = mejor.nombre + ' lidera en productividad alta (' + F().porcentaje(mejor.porcentajeAlta, 0) +
          ') y ' + peor.nombre + ' cierra la tabla (' + F().porcentaje(peor.porcentajeAlta, 0) + ')';
      }
      const cuerpo = UI.cabecera(host, this, linea);

      // Una tabla para comparar las zonas de un vistazo, ordenada por % en alta.
      const ordenadas = filas.slice().sort((a, b) => a.posicion - b.posicion);
      const panel = UI.panel('Cómo termina cada zona', 'ordenadas por % de cajeros en ' + Datos.categoria('alta').toLowerCase());
      // La tabla nunca se achica por debajo de su alto natural: los textos ceden primero.
      panel.style.flex = '1 0 auto';
      panel.appendChild(tablaZonas(ctx, ordenadas, resumen.baseVariacion));
      cuerpo.appendChild(panel);

      // Los textos de cierre, si están cargados, van debajo y del tamaño de su contenido.
      const conTexto = ordenadas.filter((f) => textoDe(f.jefe) && textoDe(f.jefe).hallazgos);
      if (conTexto.length) {
        const grilla = UI.elemento('div');
        const columnas = conTexto.length <= 3 ? conTexto.length : conTexto.length <= 6 ? 3 : 4;
        grilla.style.cssText = 'display:grid;gap:9px;grid-template-columns:repeat(' + columnas + ',1fr);flex:0 1 auto;min-height:0;overflow:hidden';
        conTexto.forEach(function (f) {
          const tarjeta = UI.elemento('div', 'tarjeta');
          tarjeta.style.cssText = 'border-left:3px solid ' + Datos.colorJefe(f.jefe) + ';padding:8px 12px;gap:3px';
          tarjeta.appendChild(UI.elemento('div', 'rotulo', f.nombre));
          const parrafo = UI.elemento('div');
          parrafo.style.cssText =
            'font-size:12.5px;line-height:1.4;color:var(--texto-suave)';
          parrafo.textContent = textoDe(f.jefe).hallazgos;
          tarjeta.appendChild(parrafo);
          grilla.appendChild(tarjeta);
        });
        cuerpo.appendChild(grilla);
        UI.recortarHijos(grilla);
      }

      const general = textoDe(-1);
      if (general && general.hallazgos) {
        const pie = UI.elemento('p', 'linea-lectura');
        pie.style.flexShrink = '0';
        pie.innerHTML = '<strong>En la red:</strong> ';
        pie.appendChild(document.createTextNode(general.hallazgos));
        cuerpo.appendChild(pie);
      }
    },
    notas: function (ctx) {
      if (ctx.vacio) return '';
      const resumen = resumenPorZona(ctx);
      const ordenadas = resumen.filas.slice().sort((a, b) => b.porcentajeAlta - a.porcentajeAlta);
      const hayTextos = !!(global.Datos.raw.textos || []).length;
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Cierro con la foto de cada zona. Los números están calculados con los mismos ' +
        'criterios para todos; lo que cambia es qué hacemos con ellos."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>La posición es el puesto de la zona por porcentaje de cajeros en ' +
        global.Datos.categoria('alta').toLowerCase() + '.' +
        '</p>' +
        (hayTextos ? '' : '<p>No hay textos de cierre cargados: las tarjetas muestran solo los números calculados.</p>') +
        '</div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        ordenadas.slice(0, 3).map(function (f) {
          return '<li>' + f.nombre + ': <span class="dato">' + F().porcentaje(f.porcentajeAlta) + '</span> en alta</li>';
        }).join('') +
        '</ul></div>'
      );
    }
  });

  // ----------------------------------------------------------- Lámina 35

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Objetivos y próximos pasos',
    subtitulo: 'Los compromisos de cada zona y de la red para el período que viene.',
    requiere: 'textos',
    render: function (host, ctx) {
      const Datos = global.Datos;
      const textos = Datos.raw.textos || [];
      const conObjetivos = textos.filter((t) => t.objetivos && t.objetivos.trim());
      if (!conObjetivos.length) {
        const cuerpoVacio = UI.cabecera(host, this, '');
        cuerpoVacio.appendChild(
          UI.vacio('Sin objetivos cargados', 'La tabla de textos de cierre no trae objetivos para este recorte.', false)
        );
        return;
      }

      const general = conObjetivos.find((t) => t.jefe === -1);
      const porZona = conObjetivos.filter((t) => t.jefe >= 0);
      const jefesVisibles = new Set(ctx.metricasCajeros().map((m) => jefeDe(m.local)));
      const visibles = porZona.filter((t) => !jefesVisibles.size || jefesVisibles.has(t.jefe));

      const linea =
        '<strong>' + F().entero(visibles.length) + '</strong> zonas tienen objetivos cargados para el período que viene' +
        (general ? ', además de los de la red' : '') + '.';

      const cuerpo = UI.cabecera(host, this, linea);

      if (general) {
        const panel = UI.panel('Objetivos de la red');
        panel.style.flexShrink = '0';
        panel.style.borderTop = '2px solid var(--amarillo)';
        const texto = UI.elemento('div');
        texto.style.cssText = 'font-size:14px;line-height:1.6;color:var(--texto)';
        texto.textContent = general.objetivos;
        panel.appendChild(texto);
        cuerpo.appendChild(panel);
      }

      const grilla = UI.elemento('div');
      const columnas = visibles.length <= 4 ? 2 : 3;
      grilla.style.cssText =
        'display:grid;gap:9px;grid-template-columns:repeat(' + columnas + ',1fr);flex-grow:1;min-height:0;overflow:auto';

      visibles.forEach(function (t) {
        const tarjeta = UI.elemento('div', 'panel');
        tarjeta.style.borderLeft = '3px solid ' + Datos.colorJefe(t.jefe);
        const titulo = UI.elemento('div', 'panel-titulo');
        titulo.appendChild(UI.elemento('span', null, Datos.jefe(t.jefe)));
        tarjeta.appendChild(titulo);
        const texto = UI.elemento('div');
        texto.style.cssText = 'font-size:12.5px;line-height:1.5;color:var(--texto);overflow:auto';
        texto.textContent = t.objetivos;
        tarjeta.appendChild(texto);
        grilla.appendChild(tarjeta);
      });

      cuerpo.appendChild(grilla);
    },
    notas: function () {
      const textos = global.Datos.raw.textos || [];
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Cerramos con lo que cada uno se lleva para el trimestre que viene. ' +
        'Estos textos se cargan con los datos, así que la próxima presentación arranca comparando contra esto."</div></div>' +
        '<div class="bloque"><h4>Cómo se lee</h4>' +
        '<p>Los objetivos vienen de la tabla <code>textos_cierre</code> del archivo de datos: ' +
        'se editan ahí y se regeneran con el resto de la presentación, no se escriben a mano en el HTML.</p></div>' +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Textos cargados: <span class="dato">' + F().entero(textos.length) + '</span></li>' +
        '</ul></div>'
      );
    }
  });

})(typeof globalThis !== 'undefined' ? globalThis : this);
