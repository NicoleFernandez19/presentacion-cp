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
        variacion: variacion
      });
    });

    const orden = filas.slice().sort((a, b) => b.porcentajeAlta - a.porcentajeAlta);
    orden.forEach(function (f, i) {
      f.posicion = i + 1;
    });
    return { filas: filas.sort((a, b) => b.ops - a.ops), total: filas.length, baseVariacion: comparar ? 'interanual' : 'primer contra último trimestre' };
  }

  // ----------------------------------------------------------- Lámina 34

  global.Navegacion.registrar({
    seccion: SECCION,
    titulo: 'Hallazgos por zona',
    subtitulo: 'Una tarjeta por jefe zonal con sus números del año y, si está cargado, el texto de cierre.',
    render: function (host, ctx) {
      const Datos = global.Datos;
      if (ctx.vacio) {
        const vacioCuerpo = UI.cabecera(host, this, 'No hay datos con los filtros seleccionados.');
        vacioCuerpo.appendChild(UI.vacio('Sin datos para este recorte', 'Ninguna operación cumple con todos los filtros activos.'));
        return;
      }

      const resumen = resumenPorZona(ctx);
      const filas = resumen.filas;
      const mejor = filas.slice().sort((a, b) => b.porcentajeAlta - a.porcentajeAlta)[0];

      const linea =
        '<strong>' + mejor.nombre + '</strong> cierra el período con la mayor proporción de cajeros en ' +
        Datos.categoria('alta').toLowerCase() + ' (<strong>' + F().porcentaje(mejor.porcentajeAlta) + '</strong>); ' +
        'la variación que se muestra es ' + resumen.baseVariacion + '.';

      const cuerpo = UI.cabecera(host, this, linea);

      const grilla = UI.elemento('div');
      const columnas = filas.length <= 6 ? 3 : filas.length <= 8 ? 4 : 5;
      grilla.style.cssText =
        'display:grid;gap:9px;grid-template-columns:repeat(' + columnas + ',1fr);flex-grow:1;min-height:0;overflow:auto';

      filas.forEach(function (f) {
        const tarjeta = UI.elemento('div', 'tarjeta');
        tarjeta.style.borderLeft = '3px solid ' + Datos.colorJefe(f.jefe);
        tarjeta.style.cursor = 'pointer';
        tarjeta.onclick = function () {
          global.Filtros.alternar('jefes', f.jefe);
        };

        const cabecera = UI.elemento('div');
        cabecera.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;gap:6px';
        cabecera.appendChild(UI.elemento('div', 'rotulo', f.nombre));
        cabecera.appendChild(UI.elemento('span', 'tenue', '#' + f.posicion + ' de ' + resumen.total));
        tarjeta.appendChild(cabecera);

        const numeros = UI.elemento('div');
        numeros.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin:4px 0 2px';
        [
          { rotulo: 'Operaciones', valor: F().compacto(f.ops) },
          { rotulo: 'En ' + Datos.categoria('alta'), valor: F().porcentaje(f.porcentajeAlta) },
          { rotulo: 'Sin actividad', valor: F().porcentaje(f.porcentajeInactivos) }
        ].forEach(function (n) {
          const caja = UI.elemento('div');
          caja.innerHTML =
            '<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--texto-tenue);font-weight:700">' +
            n.rotulo + '</div><div style="font-size:17px;font-weight:800;color:#fff">' + n.valor + '</div>';
          numeros.appendChild(caja);
        });
        tarjeta.appendChild(numeros);

        if (f.variacion !== null) {
          const clase = f.variacion > 0 ? 'sube' : f.variacion < 0 ? 'baja' : 'neutra';
          const flecha = f.variacion > 0 ? '▲' : f.variacion < 0 ? '▼' : '=';
          tarjeta.appendChild(
            UI.elemento('div', 'variacion ' + clase, flecha + ' ' + F().variacion(f.variacion) + ' ' + resumen.baseVariacion)
          );
        }

        const texto = textoDe(f.jefe);
        if (texto && texto.hallazgos) {
          const parrafo = UI.elemento('div');
          parrafo.style.cssText =
            'margin-top:6px;padding-top:6px;border-top:1px solid var(--borde);font-size:11.5px;line-height:1.45;color:var(--texto-suave)';
          parrafo.textContent = texto.hallazgos;
          tarjeta.appendChild(parrafo);
        }

        grilla.appendChild(tarjeta);
      });

      cuerpo.appendChild(grilla);

      const general = textoDe(-1);
      if (general && general.hallazgos) {
        const panel = UI.panel('Hallazgos de la red');
        panel.style.flexShrink = '0';
        const texto = UI.elemento('div');
        texto.style.cssText = 'font-size:13px;line-height:1.55;color:var(--texto)';
        texto.textContent = general.hallazgos;
        panel.appendChild(texto);
        cuerpo.appendChild(panel);
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
        global.Datos.categoria('alta').toLowerCase() + '. Un clic en una tarjeta filtra toda la presentación ' +
        'por esa zona: sirve para pasar del cierre al detalle sin cambiar de archivo.</p>' +
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
        tarjeta.style.cursor = 'pointer';
        tarjeta.onclick = function () {
          global.Filtros.alternar('jefes', t.jefe);
        };
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
