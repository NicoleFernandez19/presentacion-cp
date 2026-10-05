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
      return z[0].nombre + ' es la zona que más avanzó y ' + z[z.length - 1].nombre + ' la que más retrocedió';
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
            F().variacion(z[0].avance) + '); más retrocede <strong>' + z[z.length - 1].nombre + '</strong> (' +
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
    subtitulo: 'Lo que se vio hoy y lo que se acuerda hacer, con responsable y fecha.',
    tituloAccion: function () {
      return 'Para acordar hoy: acciones, responsables y fechas';
    },
    render: function (host, ctx) {
      const m = mensajes(ctx);
      const cuerpo = UI.cabecera(host, this, '');
      const fila = UI.fila(true);

      const izq = UI.panel('Lo que vimos');
      izq.style.flex = '1 1 0';
      const lista = UI.elemento('ul', 'vistos');
      const item = function (html) {
        const li = UI.elemento('li');
        li.innerHTML = html;
        lista.appendChild(li);
      };
      item('<strong>' + F().entero(m.ops) + '</strong> operaciones en ' + m.meses + ' meses' +
        (m.conVentana && m.red.varOps !== null ? ', <strong>' + F().variacion(m.red.varOps) + '</strong> en la ventana final' : '') + '.');
      if (menosGente(m)) {
        item('Hay <strong>' + F().variacion(m.red.varOperadores) + '</strong> de operadores: la productividad por operador sube en parte por eso.');
      }
      const z = m.zonas.filas;
      if (z.length >= 2) {
        item('<strong>' + z[0].nombre + '</strong> avanza más (' + F().variacion(z[0].avance) + '); <strong>' +
          z[z.length - 1].nombre + '</strong> retrocede más (' + F().variacion(z[z.length - 1].avance) + ').');
      }
      if (m.alta.valor !== null) {
        item('<strong>' + F().porcentaje(m.alta.valor, 0) + '</strong> de los cajeros está en productividad alta.');
      }
      izq.appendChild(lista);
      fila.appendChild(izq);

      const der = UI.panel('Lo que acordamos');
      der.style.flex = '1.3 1 0';
      const textos = global.Datos.raw.textos || [];
      const general = textos.find((t) => t.jefe === -1 && t.objetivos && t.objetivos.trim());
      if (general) {
        const objetivos = UI.elemento('div');
        objetivos.style.cssText = 'font-size:14px;line-height:1.5;color:var(--texto);margin-bottom:8px';
        objetivos.textContent = general.objetivos;
        der.appendChild(objetivos);
      }
      const tabla = UI.elemento('table', 'acuerdos');
      tabla.innerHTML = '<thead><tr><th>Acción</th><th style="width:22%">Responsable</th><th style="width:16%">Fecha</th></tr></thead>';
      const cuerpoTabla = UI.elemento('tbody');
      for (let i = 0; i < 4; i++) cuerpoTabla.appendChild(UI.elemento('tr')).innerHTML = '<td></td><td></td><td></td>';
      tabla.appendChild(cuerpoTabla);
      der.appendChild(tabla);
      fila.appendChild(der);

      cuerpo.appendChild(fila);
    },
    notas: function () {
      return (
        '<div class="bloque"><h4>Guión para el orador</h4>' +
        '<div class="guion">"Cerramos con lo que nos llevamos: qué acción toma cada zona, quién la lleva y para cuándo. ' +
        'Lo anotamos acá, antes de salir."</div></div>' +
        '<div class="bloque"><h4>Cómo usarla</h4>' +
        '<p>La tabla de la derecha se completa durante la reunión (o se prepara antes). Si la tabla ' +
        '<code>textos_cierre</code> trae los objetivos de la red, aparecen arriba de la tabla.</p></div>'
      );
    }
  });

  enchufarTitulos();
})(typeof globalThis !== 'undefined' ? globalThis : this);
