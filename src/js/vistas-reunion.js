/* Modo reunión: lo que une el recorrido.

   Acá viven las dos láminas que faltaban para que la presentación se pueda
   contar de corrido —el resumen ejecutivo del principio y las decisiones del
   final— y los títulos de acción de las demás: cada lámina titula con la
   conclusión, calculada con los datos, y no con el nombre del gráfico.

   Los títulos de acción se enchufan a las láminas ya registradas por su título
   (`tituloAccion`). Las dos láminas de rankings y la de hallazgos fijan el suyo
   desde su propia vista, porque dependen de lo que ellas mismas calculan. */
(function (global) {
  'use strict';

  const F = () => global.Formato;

  // ------------------------------------------------------------- insumos

  function etiquetaVentana(ventana) {
    if (!ventana) return '';
    const texto = function (periodos) {
      return periodos.length === 1
        ? F().mesCorto(periodos[0])
        : F().mesCorto(periodos[0]) + ' a ' + F().mesCorto(periodos[periodos.length - 1]);
    };
    return texto(ventana.inicio) + ' contra ' + texto(ventana.fin);
  }

  /* Zonas con su avance (operaciones por operador, ventana final contra inicial),
     de mayor a menor. Mismo criterio que el tablero de avance. */
  function zonasPorAvance(ctx) {
    const avance = ctx.avancePorJefe();
    const filas = avance.filas
      .filter((f) => f.total.ops > 0 && f.varOpsPorOperador !== null && f.varOpsPorOperador !== undefined)
      .map((f) => ({ jefe: f.jefe, nombre: global.Datos.jefe(f.jefe), avance: f.varOpsPorOperador }));
    filas.sort((a, b) => b.avance - a.avance);
    return { ventana: avance.ventana, filas: filas };
  }

  function porcentajeAlta(ctx) {
    const c = ctx.conteoCategorias();
    const con = c.alta + c.media + c.baja;
    return { valor: con ? (c.alta / con) * 100 : null, alta: c.alta, con: con };
  }

  /* Los mensajes del resumen, una sola vez: los usan el resumen ejecutivo y la
     lámina de decisiones. */
  function mensajes(ctx) {
    const red = ctx.avanceRed();
    const zonas = zonasPorAvance(ctx);
    const meses = ctx.periodos.length;
    const totales = ctx.totales();
    const porMes = ctx.porMes();
    return {
      red: red,
      zonas: zonas,
      meses: meses,
      ops: totales.ops,
      promedio: meses ? totales.ops / meses : 0,
      operadoresInicio: porMes.length ? porMes[0].cajerosConActividad : null,
      operadoresFin: porMes.length ? porMes[porMes.length - 1].cajerosConActividad : null,
      mesInicio: F().mes(ctx.periodos[0]),
      mesFin: F().mes(ctx.periodos[ctx.periodos.length - 1]),
      alta: porcentajeAlta(ctx),
      conVentana: !!red.ventana
    };
  }

  function menosGente(m) {
    return m.conVentana && m.red.varOperadores !== null && m.red.varOperadores < -0.5;
  }

  /* La zona del fondo no siempre retrocede: si su avance es positivo, decir
     «retrocede» con un +2% al lado se lee como un error. */
  function verboDelUltimo(avance) {
    return avance < -0.5 ? 'retrocede más' : 'avanza menos';
  }

  // -------------------------------------------------------- títulos de acción

  const TITULOS = {
    'Indicadores del año': function (ctx) {
      return 'La red hizo ' + F().entero(ctx.totales().ops) + ' operaciones en ' + ctx.periodos.length + ' meses';
    },
    'Mapa de calor anual': function (ctx) {
      const zonas = Array.from(ctx.porJefe().entries()).sort((a, b) => b[1].ops - a[1].ops);
      const total = ctx.totales().ops;
      if (!zonas.length || !total) return null;
      return global.Datos.jefe(zonas[0][0]) + ' concentra el ' + F().porcentaje((zonas[0][1].ops / total) * 100, 0) +
        ' de las operaciones del período';
    },
    'Red por jefe zonal': function (ctx) {
      return 'La red son ' + F().entero(ctx.localesVisibles.length) + ' locales y ' +
        F().entero(ctx.metricasCajeros().length) + ' cajeros en ' + ctx.porJefe().size + ' zonas';
    },
    'Operadores por mes': function (ctx) {
      const m = ctx.porMes();
      if (m.length < 2) return null;
      const a = m[0].cajerosConActividad;
      const b = m[m.length - 1].cajerosConActividad;
      const verbo = b < a ? 'bajaron' : b > a ? 'subieron' : 'se mantuvieron';
      return 'Los operadores ' + verbo + ' de ' + F().entero(a) + ' en ' + F().mes(ctx.periodos[0]).split(' ')[0] +
        ' a ' + F().entero(b) + ' en ' + F().mes(ctx.periodos[ctx.periodos.length - 1]).split(' ')[0];
    },
    'Tablero de avance por zona': function (ctx) {
      const red = ctx.avanceRed();
      if (!red.ventana || red.varOps === null) return null;
      return 'La red movió ' + F().variacion(red.varOps) + ' de operaciones con ' +
        F().variacion(red.varOperadores) + ' de operadores';
    },
    'Trayectoria de cada zona': function (ctx) {
      const z = zonasPorAvance(ctx).filas;
      if (z.length < 2) return null;
      const ultimo = z[z.length - 1];
      return z[0].nombre + ' es la zona que más avanzó y ' + ultimo.nombre +
        (ultimo.avance < -0.5 ? ' la que más retrocedió' : ' la que menos');
    },
    'Criterio de categorías': function () {
      return 'Cada cajero se compara solo con los de su mismo tipo de zona';
    },
    'Categorías por jefe zonal': function (ctx) {
      const a = porcentajeAlta(ctx);
      if (a.valor === null) return null;
      return F().porcentaje(a.valor, 0) + ' de los cajeros de la red está en productividad alta';
    }
  };

  function enchufarTitulos() {
    global.Navegacion.laminas.forEach(function (lamina) {
      if (TITULOS[lamina.titulo]) {
        lamina.tituloAccion = function (ctx) {
          try {
            return TITULOS[lamina.titulo](ctx);
          } catch (error) {
            return null;
          }
        };
      }
    });
  }

  // ------------------------------------------------------ Resumen ejecutivo

  function mensaje(rotulo, cifra, texto, alerta) {
    const caja = UI.elemento('div', 'mensaje' + (alerta ? ' alerta' : ''));
    caja.appendChild(UI.elemento('div', 'rotulo', rotulo));
    caja.appendChild(UI.elemento('div', 'cifra', cifra));
    const p = UI.elemento('div', 'texto');
    p.innerHTML = texto;
    caja.appendChild(p);
    return caja;
  }

  global.Navegacion.registrar({
    seccion: 'Resumen del año',
    titulo: 'Resumen ejecutivo',
    subtitulo: 'El año en cuatro mensajes: volumen, gente, productividad y zonas.',
    tituloAccion: function (ctx) {
      const m = mensajes(ctx);
      return menosGente(m) && m.red.varOpsPorOperador > 0.5
        ? 'La productividad por operador sube, pero en parte porque hay menos operadores'
        : 'El año en cuatro mensajes';
    },
    render: function (host, ctx) {
      const m = mensajes(ctx);
      const cuerpo = UI.cabecera(host, this, '');
      if (ctx.vacio) {
        cuerpo.appendChild(UI.vacio('Sin datos', 'No hay operaciones en el período.'));
        return;
      }
      const grilla = UI.elemento('div', 'mensajes');

      grilla.appendChild(
        mensaje(
          'Volumen',
          F().entero(m.ops),
          'operaciones en ' + m.meses + ' meses, <strong>' + F().entero(Math.round(m.promedio)) + '</strong> por mes' +
          (m.conVentana && m.red.varOps !== null
            ? ' · <strong>' + F().variacion(m.red.varOps) + '</strong> entre ' + etiquetaVentana(m.red.ventana)
            : '') + '.'
        )
      );

      grilla.appendChild(
        mensaje(
          'Gente',
          m.operadoresFin === null ? '—' : F().entero(m.operadoresFin),
          'operadores en ' + m.mesFin + ', contra <strong>' + F().entero(m.operadoresInicio) + '</strong> en ' + m.mesInicio +
          (m.conVentana && m.red.varOperadores !== null ? ' · <strong>' + F().variacion(m.red.varOperadores) + '</strong> en la ventana final.' : '.'),
          menosGente(m)
        )
      );

      grilla.appendChild(
        mensaje(
          'Productividad',
          m.conVentana ? F().variacion(m.red.varOpsPorOperador) : '—',
          'en operaciones por operador, contra el arranque.' +
          (menosGente(m) ? ' <strong>Buena parte es el denominador:</strong> hay menos gente repartiéndose el mismo trabajo.' : ''),
          menosGente(m)
        )
      );

      const z = m.zonas.filas;
      if (z.length >= 2) {
        const suben = z.filter((f) => f.avance > 0.5).length;
        grilla.appendChild(
          mensaje(
            'Zonas',
            suben + ' de ' + z.length,
            'zonas avanzan contra su propio arranque. Más avanza <strong>' + z[0].nombre + '</strong> (' +
            F().variacion(z[0].avance) + '); ' + verboDelUltimo(z[z.length - 1].avance) + ' <strong>' + z[z.length - 1].nombre + '</strong> (' +
            F().variacion(z[z.length - 1].avance) + ').'
          )
        );
      }
      cuerpo.appendChild(grilla);

      if (m.alta.valor !== null) {
        const pie = UI.elemento('p', 'linea-lectura');
        pie.innerHTML =
          '<strong>' + F().porcentaje(m.alta.valor, 0) + '</strong> de los cajeros con datos suficientes (' +
          F().entero(m.alta.alta) + ' de ' + F().entero(m.alta.con) + ') está en productividad alta, el tercio superior de su tipo de zona.';
        pie.style.flexShrink = '0';
        cuerpo.appendChild(pie);
      }
    },
    notas: function (ctx) {
      const m = mensajes(ctx);
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Antes de entrar al detalle, cuatro mensajes: cuánto hicimos, con cuánta gente, ' +
        'cómo se movió la productividad y qué zonas avanzan. El resto de la reunión es la prueba de estos cuatro."</div></div>' +
        (menosGente(m)
          ? '<div class="bloque"><h4>Ojo</h4><p>Hay menos operadores que al arranque, así que parte de la mejora ' +
          'en operaciones por operador es el denominador cayendo y no más trabajo hecho. Conviene decirlo antes ' +
          'de que lo pregunten.</p></div>'
          : '') +
        '<div class="bloque"><h4>Datos</h4><ul>' +
        '<li>Operaciones: <span class="dato">' + F().entero(m.ops) + '</span></li>' +
        '<li>Ventana de comparación: <span class="dato">' + etiquetaVentana(m.red.ventana) + '</span></li>' +
        '</ul></div>'
      );
    }
  });

  // ------------------------------------------------------------ Decisiones

  global.Navegacion.registrar({
    seccion: 'Cierre',
    titulo: 'Decisiones y próximos pasos',
    subtitulo: 'Lo que se vio hoy y los próximos pasos de la red y de cada zona.',
    tituloAccion: function (ctx) {
      const m = mensajes(ctx);
      const z = m.zonas.filas;
      return 'Cerramos con ' + F().compacto(m.ops) + ' operaciones' +
        (m.conVentana && m.red.varOps !== null ? ' (' + F().variacion(m.red.varOps) + ')' : '') +
        (z.length ? ' y ' + z.filter((f) => f.avance > 0.5).length + ' de ' + z.length + ' zonas avanzando' : '');
    },
    render: function (host, ctx) {
      const cuerpo = UI.cabecera(host, this, '');
      if (ctx.vacio) {
        cuerpo.appendChild(UI.vacio('Sin datos', 'No hay operaciones en el período.'));
        return;
      }
      const m = mensajes(ctx);
      const z = m.zonas.filas;
      const Datos = global.Datos;
      const textos = Datos.raw.textos || [];
      const general = textos.find((t) => t.jefe === -1 && t.objetivos && t.objetivos.trim());
      const porZona = textos.filter((t) => t.jefe >= 0 && t.objetivos && t.objetivos.trim());
      const hayPasos = !!(general || porZona.length);

      // Lo que vimos: los números del año, grandes. Sin próximos pasos cargados ocupan toda la lámina.
      const grilla = UI.elemento('div', 'mensajes');
      grilla.style.cssText = hayPasos ? 'grid-template-columns:repeat(4,1fr);flex:0 0 auto' : '';
      grilla.appendChild(
        mensaje(
          'Volumen',
          m.conVentana && m.red.varOps !== null ? F().variacion(m.red.varOps) : F().compacto(m.ops),
          '<strong>' + F().entero(m.ops) + '</strong> operaciones en ' + m.meses + ' meses.'
        )
      );
      if (m.conVentana && m.red.varOperadores !== null) {
        grilla.appendChild(
          mensaje(
            'Gente',
            F().variacion(m.red.varOperadores),
            'de operadores' + (menosGente(m) ? ': la productividad por operador sube en parte por eso.' : '.'),
            menosGente(m)
          )
        );
      }
      if (m.alta.valor !== null) {
        grilla.appendChild(
          mensaje('Productividad', F().porcentaje(m.alta.valor, 0), 'de los cajeros está en productividad alta.')
        );
      }
      if (z.length >= 2) {
        const ultimo = z[z.length - 1];
        grilla.appendChild(
          mensaje(
            'Zonas',
            z.filter((f) => f.avance > 0.5).length + ' de ' + z.length,
            'avanzan. Más avanza <strong>' + z[0].nombre + '</strong> (' + F().variacion(z[0].avance) + '); ' +
            verboDelUltimo(ultimo.avance) + ' <strong>' + ultimo.nombre + '</strong> (' + F().variacion(ultimo.avance) + ').',
            ultimo.avance < -0.5
          )
        );
      }
      cuerpo.appendChild(grilla);

      // Próximos pasos: solo lo que trae textos_cierre. Nunca una tabla vacía.
      if (hayPasos) {
        const panel = UI.panel('Próximos pasos');
        panel.style.flex = '1 1 auto';
        panel.style.minHeight = '0';
        if (general) {
          const red = UI.elemento('div');
          red.style.cssText = 'font-size:clamp(15px,2vh,20px);flex-shrink:0;line-height:1.5;color:#fff;border-left:3px solid var(--amarillo);padding:4px 0 4px 14px;margin:4px 0 10px';
          red.textContent = general.objetivos;
          panel.appendChild(red);
        }
        if (porZona.length) {
          const lista = UI.elemento('div');
          lista.style.cssText = 'display:grid;gap:8px 18px;grid-template-columns:repeat(' + (porZona.length > 4 ? 2 : 1) + ',1fr);align-content:space-evenly;flex:1 1 auto;min-height:0;overflow:hidden';
          porZona.forEach(function (t) {
            const item = UI.elemento('div');
            item.style.cssText = 'font-size:clamp(13px,1.6vh,16px);line-height:1.45;color:var(--texto);border-left:3px solid ' + Datos.colorJefe(t.jefe) + ';padding-left:10px';
            const nombre = UI.elemento('strong', null, Datos.jefe(t.jefe) + ': ');
            nombre.style.color = '#fff';
            item.appendChild(nombre);
            item.appendChild(document.createTextNode(t.objetivos));
            lista.appendChild(item);
          });
          panel.appendChild(lista);
        }
        cuerpo.appendChild(panel);
        const listaPasos = panel.lastChild;
        if (porZona.length && listaPasos) UI.recortarHijos(listaPasos);
      }
    },
    notas: function () {
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Cerramos con lo que nos llevamos: los cuatro números del año y lo que hace cada zona ' +
        'a partir de ahora."</div></div>' +
        '<div class="bloque"><h4>De dónde salen los próximos pasos</h4>' +
        '<p>Los objetivos de la red y de cada zona salen de <code>textos_cierre</code>. Si no está cargada, ' +
        'la lámina muestra solo los números del año.</p></div>'
      );
    }
  });

  enchufarTitulos();
})(typeof globalThis !== 'undefined' ? globalThis : this);
