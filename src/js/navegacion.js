/* Navegación entre láminas, panel de notas, modo proyección, panel de detalle e
   impresión. Mantiene el contrato de funciones de la skill presentation-slim:
   renderSlide, nextSlide, prevSlide, goToSlide, toggleNotesPanel,
   toggleFullscreen, alertMessage, copyPrompt. */
(function (global) {
  'use strict';

  // --------------------------------------------------------- piezas de UI

  /* Glosario de campos. Se aplica solo a cualquier encabezado de tabla, rótulo
     de tarjeta o fila de detalle cuyo texto coincida, así que alcanza con
     agregar un término acá para que aparezca en todas las láminas donde exista.
     Una lámina puede pasar su propia `ayuda` en la columna y esa gana. */
  const GLOSARIO = {
    // --- productividad
    'ip': 'Índice de productividad: operaciones del período divididas por los meses en que esa persona operó al menos una vez. No se divide por días porque los datos no tienen detalle diario.',
    'ip prom.': 'Promedio del IP de los cajeros con datos suficientes. Un local o una zona valen lo que rinde su gente, no lo que suman entre todos.',
    'ip promedio': 'Promedio del IP de los cajeros con datos suficientes.',
    'ip inicial': 'IP en la ventana inicial del período (los primeros meses).',
    'ip final': 'IP en la ventana final del período (los últimos meses).',
    'ip antes': 'IP promedio de esos cajeros en los meses anteriores a la capacitación.',
    'ip después': 'IP promedio de esos cajeros desde el mes de la capacitación en adelante.',
    'percentil': 'Posición dentro de los cajeros de su mismo tipo de zona, de 0 a 100. Un 90 significa que rinde más que el 90% de sus comparables.',
    'percentil inicial': 'Percentil en el primer trimestre completo del período.',
    'percentil final': 'Percentil en el último trimestre completo del período.',
    'categoría': 'Alta, Media o Baja según el percentil de IP dentro del tipo de zona. Se calcula sobre toda la red y no cambia al filtrar: filtrar cambia a quién se ve, no en qué categoría está.',
    'categoría del local': 'Surge del IP promedio del local comparado con los locales de su mismo tipo de zona.',
    'mejora': 'Puntos de percentil que subió o bajó entre el primer y el último trimestre completo. Se mide en percentil y no en operaciones para que sean comparables zonas de alto y de bajo movimiento.',
    'meses act.': 'Meses del período en los que hizo al menos una operación.',
    'meses activos': 'Meses del período en los que hizo al menos una operación. Es el divisor del IP.',
    '% meses': 'Proporción de meses activos sobre los meses en que estuvo habilitado, no sobre el período entero.',
    'alta desde': 'Valor de IP a partir del cual un cajero de ese tipo de zona entra en categoría Alta.',
    'baja hasta': 'Valor de IP por debajo del cual un cajero de ese tipo de zona queda en categoría Baja.',
    'mediana': 'El valor del medio: la mitad de los cajeros está por encima y la mitad por debajo.',
    'máximo': 'El IP más alto de ese tipo de zona. Sirve para dimensionar cuánto separa al mejor del corte de Alta.',

    // --- avance
    'avance': 'Variación contra el arranque de la propia zona: los primeros meses del período contra los últimos. No compara contra las demás zonas.',
    'variación': 'Diferencia porcentual contra el punto de partida.',
    'ops./operador': 'Operaciones divididas por la cantidad de operadores distintos. Normaliza por tamaño para que una zona grande y una chica sean comparables.',
    'ops./local': 'Operaciones divididas por los locales con actividad.',
    'ops./cajero': 'Operaciones divididas por los cajeros que operaron.',
    'operaciones por operador': 'Operaciones divididas por la cantidad de operadores distintos.',
    'operaciones por cajero': 'Operaciones divididas por los cajeros que operaron en el período.',
    'operaciones por cajero activo': 'Se divide por los que operaron, no por los habilitados: si no, una zona con mucha inactividad parecería menos productiva de lo que es.',
    'operaciones por local activo': 'Operaciones divididas por los locales que tuvieron al menos una operación.',
    'lectura': 'Resumen en palabras de qué combinación de gente y productividad explica el movimiento de esa zona.',

    // --- operadores y dotación
    'operadores': 'Legajos distintos que hicieron al menos una operación. Es el número auditable: coincide con la fuente.',
    'operadores por mes': 'Promedio mensual de legajos distintos que operaron.',
    'operadores del período': 'Legajos distintos que operaron en algún momento del período. No es la suma de los meses: quien operó todo el año cuenta una vez.',
    'dotación estimada': 'Cajeros habilitados estimados. Las altas y las bajas se infieren de la actividad, así que no es un padrón de usuarios.',
    'meses sin operar': 'Meses intermedios en que un legajo dejó de operar y después volvió. No es la inactividad real de la red.',
    'cajeros habilitados': 'Cajeros con el usuario vigente ese mes, hayan operado o no.',
    'con actividad': 'Operaron al menos una vez, en cualquier local o grupo.',
    'con act.': 'Operaron al menos una vez en el período.',
    'sin actividad': 'Estaban habilitados y no operaron.',
    '% sin act.': 'Porcentaje de los cajeros del local que no operaron en el período.',
    'cajeros': 'Cajeros asociados al recorte: los asignados más los que operaron ahí.',
    'cajeros/local': 'Cuántos cajeros tiene en promedio cada local de esa zona. Es densidad, no productividad.',
    'cajeros por local': 'Cuántos cajeros tiene en promedio cada local de esa zona.',
    'cajero-mes': 'Un cajero que operó un mes cuenta como un cajero-mes. Permite medir tamaño sin que pesen las altas y las bajas.',

    // --- estructura
    'tipo de zona': 'Alto o bajo movimiento según el volumen de la localidad. Es la vara con la que se comparan los cajeros entre sí. Ojo: como la mayoría de las localidades tiene un solo local, hoy separa locales grandes de chicos más que plazas de distinto movimiento.',
    'zona': 'Tipo de zona: alto o bajo movimiento. Con los datos actuales equivale más a tamaño del local que a característica de la plaza.',
    'jefe zonal': 'Responsable de ese conjunto de locales.',
    'localidad': 'Se deriva del nombre del local porque los datos no traen la ciudad como campo propio; el 91% de las localidades así obtenidas tiene un único local.',
    'localidades': 'Cantidad de localidades distintas en las que la zona tiene locales.',
    'prov.': 'Cantidad de provincias en las que la zona tiene locales.',
    'provincias': 'Cantidad de provincias en las que la zona tiene locales.',
    'grupo': 'SF2 sin TEC, TEC o Money Transfer. Cada uno tiene sus propios tipos de operación.',
    'locales': 'Locales del recorte, con actividad o sin ella.',
    'locales con actividad': 'Locales con al menos una operación en el período.',

    // --- volumen y rankings
    'operaciones': 'Cantidad de transacciones. La presentación no muestra importes.',
    'ops.': 'Cantidad de transacciones del recorte.',
    'ops. del período': 'Transacciones acumuladas en todo el período elegido.',
    'operaciones acumuladas': 'Total de transacciones del período, con los filtros aplicados.',
    'promedio mensual': 'Total dividido por los meses del período elegido, no por doce.',
    'pos. red': 'Puesto en el ranking de toda la red, no solo de su zona.',
    'posición en la red': 'Puesto en el ranking de toda la red, no solo de su zona.',
    '% en productividad alta': 'Sobre los cajeros con datos suficientes, no sobre el total: los que no llegan al mínimo de meses activos no tienen categoría.',
    '% que operó todos los meses': 'Sobre los meses en que cada uno estuvo habilitado, no sobre el período entero.',
    'trimestres evaluados': 'Trimestres completos dentro del período. Un trimestre con meses faltantes no se evalúa.',
    'datos al': 'Último día del último mes completo de datos. Septiembre queda afuera del período por defecto hasta que cierre.',
    'local': 'Punto de venta donde se hizo la operación.',
    'cajero': 'Identificado por legajo, no por nombre: el mismo nombre puede estar escrito de varias formas.',
    'operaciones del período': 'Total de transacciones del período elegido.',
    'cajeros del recorte': 'Cajeros que quedan dentro de los filtros activos.',
    'mayor avance': 'La zona que más mejoró contra su propio arranque.',
    'mayor retroceso': 'La zona que más cayó contra su propio arranque.',
    'la red': 'El mismo cálculo aplicado a toda la red, como línea de referencia.',
    'zonas que avanzan': 'Cuántas zonas mejoraron sus operaciones por operador contra su propio arranque.',
    'siempre en alta': 'Estuvo en categoría Alta en todos los trimestres completos del período, no solo en uno.',
    'siempre en baja': 'Estuvo en categoría Baja en todos los trimestres completos del período.',

    // --- comparación contra el grupo de pares
    'pares': 'Grupo de locales parecidos contra el que se mide a cada uno. Es una agrupación externa, no se calcula con el volumen: así nadie se compara contra plazas que no le tocan.',
    'cajeros crónicos': 'Cajeros que quedaron por debajo de la vara de su grupo de pares durante varios meses seguidos, no en un mes puntual.',
    'meses bajo': 'Cantidad de meses en que quedó por debajo de la vara de su grupo de pares.',
    'meses bajo la vara': 'Cuántos meses seguidos hay que estar por debajo de los pares para entrar en la lista.',
    'sobre los evaluados': 'Porcentaje sobre los cajeros que tienen datos suficientes para ser evaluados.',
    'operaciones por recuperar': 'Cuántas operaciones sumaría la red si esos cajeros llegaran al valor del medio de sus pares. Es un techo teórico, sirve para dimensionar.',
    'esperado': 'Lo que rendiría esa zona si sus cajeros rindieran como el valor del medio de sus pares.',
    'esperado según pares': 'Lo que rendiría si sus cajeros rindieran como el valor del medio de su grupo de pares.',
    'rinde': 'Operaciones reales divididas por las esperadas según el grupo de pares. Uno es rendir igual que sus pares.',
    'rendimiento': 'Operaciones reales sobre las esperadas según el grupo de pares.',
    'cobertura': 'Qué proporción de su gente está operando.',
    'cola': 'Peso de los cajeros que quedan sistemáticamente por debajo de sus pares.',
    'brecha': 'Cuántas veces rinde más el mejor punto de la localidad que el más flojo.',
    'en juego': 'Operaciones que sumaría el punto flojo si rindiera como el mejor de su misma localidad.',
    'índice': 'Puntaje que combina los cuatro pilares con los pesos definidos en la configuración. Se muestra con su margen de error: dos zonas cuyas bandas se superponen no están realmente separadas.',
    '# vol.': 'Puesto que le daría ordenar por cantidad de operaciones, para contrastar contra el criterio nuevo.'
  };

  function claveGlosario(texto) {
    return String(texto || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  const UI = {
    GLOSARIO: GLOSARIO,

    /* Explicación de un campo, si está en el glosario. */
    ayudaDe: function (texto) {
      return GLOSARIO[claveGlosario(texto)] || null;
    },

    /* Marca un nodo como explicable: subrayado punteado y cursor de ayuda. */
    conAyuda: function (nodo, texto, explicita) {
      const ayuda = explicita || UI.ayudaDe(texto);
      if (!ayuda) return nodo;
      nodo.title = ayuda;
      nodo.classList.add('con-ayuda');
      return nodo;
    },

    /* Sin scroll (D-29): los hijos que no entran enteros en el contenedor se
       ocultan en lugar de quedar cortados a la mitad. Se mide después del layout. */
    recortarHijos: function (contenedor) {
      requestAnimationFrame(function () {
        const alto = contenedor.clientHeight;
        Array.from(contenedor.children).forEach(function (hijo) {
          hijo.style.visibility = hijo.offsetTop - contenedor.offsetTop + hijo.offsetHeight > alto + 1 ? 'hidden' : '';
        });
      });
    },

    elemento: function (etiqueta, clase, texto) {
      const nodo = document.createElement(etiqueta);
      if (clase) nodo.className = clase;
      if (texto !== undefined && texto !== null) nodo.textContent = texto;
      return nodo;
    },

    /* Cabecera de la lámina: sección, título y línea de lectura (§8). */
    cabecera: function (host, lamina, lineaLectura) {
      const caja = UI.elemento('div', 'lamina-cabecera');
      caja.appendChild(UI.elemento('div', 'lamina-seccion', lamina.seccion));
      caja.appendChild(UI.elemento('h2', null, lamina.tituloActual || lamina.titulo));
      if (lineaLectura) {
        const linea = UI.elemento('p', 'linea-lectura');
        linea.innerHTML = lineaLectura;
        caja.appendChild(linea);
      }
      host.appendChild(caja);
      const cuerpo = UI.elemento('div', 'lamina-cuerpo');
      host.appendChild(cuerpo);
      return cuerpo;
    },

    panel: function (titulo, aclaracion) {
      const panel = UI.elemento('div', 'panel');
      if (titulo) {
        const cabecera = UI.elemento('div', 'panel-titulo');
        cabecera.appendChild(UI.elemento('span', null, titulo));
        if (aclaracion) cabecera.appendChild(UI.elemento('span', 'aclaracion', aclaracion));
        panel.appendChild(cabecera);
      }
      return panel;
    },

    grafico: function (panel) {
      const caja = UI.elemento('div', 'grafico');
      panel.appendChild(caja);
      return caja;
    },

    fila: function (crece) {
      return UI.elemento('div', 'fila' + (crece ? ' fila-crece' : ''));
    },

    col: function (crece) {
      return UI.elemento('div', 'col' + (crece === false ? '' : ' col-crece'));
    },

    /* Tarjetas de KPI: valor, rótulo y, si corresponde, variación con signo. */
    tarjetas: function (lista, columnas) {
      const grid = UI.elemento('div', 'tarjetas' + (columnas ? ' de-' + columnas : ''));
      lista.forEach(function (t) {
        const tarjeta = UI.elemento('div', 'tarjeta');
        tarjeta.appendChild(UI.conAyuda(UI.elemento('div', 'rotulo', t.rotulo), t.rotulo, t.ayuda));
        tarjeta.appendChild(UI.elemento('div', 'valor' + (t.chico ? ' chico' : ''), t.valor));
        if (t.variacion !== undefined && t.variacion !== null) {
          const clase = t.variacion > 0 ? 'sube' : t.variacion < 0 ? 'baja' : 'neutra';
          const flecha = t.variacion > 0 ? '▲' : t.variacion < 0 ? '▼' : '=';
          const nodo = UI.elemento('div', 'variacion ' + clase, flecha + ' ' + global.Formato.variacion(t.variacion) + (t.textoVariacion ? ' ' + t.textoVariacion : ''));
          tarjeta.appendChild(nodo);
        }
        if (t.detalle) tarjeta.appendChild(UI.elemento('div', 'detalle', t.detalle));
        grid.appendChild(tarjeta);
      });
      return grid;
    },

    /* Tabla ordenable. columnas: [{titulo, clave, num, render, ancho}] */
    tabla: function (opciones) {
      const caja = UI.elemento('div', 'tabla-caja scroll-fino');
      const tabla = UI.elemento('table', 'tabla');
      const thead = UI.elemento('thead');
      const filaCabecera = UI.elemento('tr');
      /* Modo reunión: la tabla se lee, no se opera. Sin orden por columna, sin
         clic en la fila y sin scroll: cada vista elige cuántas filas entran. */
      opciones.ordenable = false;
      opciones.alClic = null;
      const estado = { clave: opciones.ordenPor || null, desc: opciones.ordenDesc !== false };

      opciones.columnas.forEach(function (col) {
        const th = UI.elemento('th', (col.num ? 'num ' : '') + (opciones.ordenable !== false && col.clave ? 'ordenable' : ''));
        th.appendChild(document.createTextNode(col.titulo));
        UI.conAyuda(th, col.titulo, col.ayuda);
        if (opciones.ordenable !== false && col.clave) {
          th.onclick = function () {
            if (estado.clave === col.clave) estado.desc = !estado.desc;
            else {
              estado.clave = col.clave;
              estado.desc = col.num !== false;
            }
            pintar();
          };
        }
        filaCabecera.appendChild(th);
      });
      thead.appendChild(filaCabecera);
      tabla.appendChild(thead);
      const tbody = UI.elemento('tbody');
      tabla.appendChild(tbody);
      caja.appendChild(tabla);

      function pintar() {
        const filas = opciones.filas.slice();
        if (estado.clave) {
          filas.sort(function (a, b) {
            const va = a[estado.clave];
            const vb = b[estado.clave];
            if (va === null || va === undefined) return 1;
            if (vb === null || vb === undefined) return -1;
            if (typeof va === 'string' || typeof vb === 'string') {
              return estado.desc
                ? String(vb).localeCompare(String(va), 'es')
                : String(va).localeCompare(String(vb), 'es');
            }
            return estado.desc ? vb - va : va - vb;
          });
        }
        tbody.innerHTML = '';
        filas.forEach(function (fila, indice) {
          const tr = UI.elemento('tr', opciones.alClic ? 'clicable' : '');
          opciones.columnas.forEach(function (col) {
            const td = UI.elemento('td', col.num ? 'num' : '');
            const contenido = col.render ? col.render(fila, indice) : fila[col.clave];
            if (contenido instanceof Node) td.appendChild(contenido);
            else td.innerHTML = contenido === null || contenido === undefined ? '—' : contenido;
            tr.appendChild(td);
          });
          if (opciones.alClic) {
            tr.onclick = function () {
              opciones.alClic(fila);
            };
          }
          tbody.appendChild(tr);
        });
        // flecha de orden
        Array.from(filaCabecera.children).forEach(function (th, i) {
          const col = opciones.columnas[i];
          const viejo = th.querySelector('.flecha');
          if (viejo) viejo.remove();
          if (col.clave && col.clave === estado.clave) {
            const flecha = UI.elemento('span', 'flecha', estado.desc ? '▼' : '▲');
            th.appendChild(flecha);
          }
        });
      }

      pintar();
      caja.repintar = pintar;
      return caja;
    },

    etiquetaCategoria: function (clave) {
      const Datos = global.Datos;
      const nodo = UI.elemento('span', 'etiqueta');
      nodo.style.background = Datos.colorCategoria(clave) + '22';
      nodo.style.borderColor = Datos.colorCategoria(clave) + '66';
      nodo.style.color = Datos.colorCategoria(clave);
      const punto = UI.elemento('span', 'punto');
      punto.style.background = Datos.colorCategoria(clave);
      nodo.appendChild(punto);
      nodo.appendChild(document.createTextNode(Datos.categoria(clave)));
      return nodo;
    },

    leyenda: function (entradas) {
      const caja = UI.elemento('div', 'leyenda');
      entradas.forEach(function (e) {
        const item = UI.elemento('span');
        const punto = UI.elemento('span', 'punto');
        punto.style.background = e.color;
        item.appendChild(punto);
        item.appendChild(document.createTextNode(e.texto));
        caja.appendChild(item);
      });
      return caja;
    },

    vacio: function (titulo, detalle) {
      const caja = UI.elemento('div', 'vacio');
      caja.appendChild(UI.elemento('div', 'titulo', titulo));
      if (detalle) caja.appendChild(UI.elemento('div', 'detalle', detalle));
      return caja;
    },

    botonCsv: function () {
      return document.createComment('sin descargas en modo reunión');
    }
  };

  // ---------------------------------------------------------- navegación

  /* El recorrido sale de config.presentacion.laminas: la lista de títulos, en
     el orden en que se presentan. Las láminas registradas que no figuran ahí
     (las tablas de consulta, los buscadores, los rankings largos) quedan
     fuera de la reunión; agregarlas de nuevo es agregar su título a la lista. */
  const Navegacion = {
    laminas: [],
    indiceActual: 0,
    ctx: null,

    registrar: function (lamina) {
      Navegacion.laminas.push(lamina);
    },

    /* Una lámina entra si figura en el guion y, si depende de un dato opcional,
       ese dato existe. El orden es el del guion. */
    laminasVisibles: function () {
      const guion = (global.Datos.config.presentacion.laminas || []).map(function (s) {
        return s.toLowerCase();
      });
      return Navegacion.laminas
        .filter(function (l) {
          if (guion.length && guion.indexOf(l.titulo.toLowerCase()) < 0) return false;
          if (!l.requiere) return true;
          const claves = Array.isArray(l.requiere) ? l.requiere : [l.requiere];
          return claves.every(function (c) {
            return global.Datos.hay(c);
          });
        })
        .map(function (lamina, indice) {
          return { lamina: lamina, indice: indice, posicion: guion.length ? guion.indexOf(lamina.titulo.toLowerCase()) : indice };
        })
        .sort(function (a, b) {
          return a.posicion - b.posicion || a.indice - b.indice;
        })
        .map((e) => e.lamina);
    },

    /* Sin temario lateral: se recorre con las flechas. */
    initSidebar: function () {},

    renderSlide: function () {
      const visibles = Navegacion.laminasVisibles();
      if (!visibles.length) return;
      Navegacion.indiceActual = Math.max(0, Math.min(Navegacion.indiceActual, visibles.length - 1));
      const lamina = visibles[Navegacion.indiceActual];

      global.Graficos.limpiar();
      const viewport = document.getElementById('slide-viewport');
      viewport.classList.add('transicion');
      viewport.innerHTML = '';

      Navegacion.ctx = global.Filtros.motor.contexto(global.Filtros.estado);
      lamina.tituloActual = lamina.tituloAccion ? lamina.tituloAccion(Navegacion.ctx) : null;

      try {
        lamina.render(viewport, Navegacion.ctx);
      } catch (error) {
        viewport.innerHTML = '';
        viewport.appendChild(
          UI.vacio('No se pudo dibujar esta lámina', String((error && error.message) || error), false)
        );
        if (global.console) global.console.error(error);
      }

      const notas = document.getElementById('notes-content');
      notas.innerHTML =
        '<div><span class="insignia">Lámina ' + (Navegacion.indiceActual + 1) + ' de ' + visibles.length + '</span>' +
        '<h4 style="margin-top:9px">' + lamina.seccion + '</h4>' +
        '<div style="font-size:15px;font-weight:700;color:#fff;margin:2px 0 6px">' + lamina.titulo + '</div>' +
        (lamina.subtitulo ? '<div style="color:var(--texto-suave)">' + lamina.subtitulo + '</div>' : '') +
        '</div>' +
        (lamina.notas ? lamina.notas(Navegacion.ctx) : '');

      document.getElementById('slide-number').textContent =
        'Lámina ' + (Navegacion.indiceActual + 1) + ' de ' + visibles.length;
      document.getElementById('slide-progress-bar').style.width =
        ((Navegacion.indiceActual + 1) / visibles.length) * 100 + '%';

      global.Filtros.escribirUrl();
      requestAnimationFrame(function () {
        viewport.classList.remove('transicion');
        global.Graficos.redimensionar();
      });
    },

    goToSlide: function (indice) {
      Navegacion.indiceActual = indice;
      Navegacion.renderSlide();
    },

    nextSlide: function () {
      if (Navegacion.indiceActual < Navegacion.laminasVisibles().length - 1) {
        Navegacion.goToSlide(Navegacion.indiceActual + 1);
      }
    },

    prevSlide: function () {
      if (Navegacion.indiceActual > 0) Navegacion.goToSlide(Navegacion.indiceActual - 1);
    },

    toggleNotesPanel: function () {
      const panel = document.getElementById('notes-panel');
      panel.classList.toggle('oculto');
      document.getElementById('txt-toggle-notes').textContent = panel.classList.contains('oculto')
        ? 'Mostrar Notas'
        : 'Ocultar Notas';
      setTimeout(global.Graficos.redimensionar, 260);
    },

    toggleFullscreen: function () {
      const marco = document.getElementById('slide-frame');
      const activo = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
      if (!activo) {
        if (marco.requestFullscreen) marco.requestFullscreen();
        else if (marco.webkitRequestFullscreen) marco.webkitRequestFullscreen();
        else if (marco.msRequestFullscreen) marco.msRequestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    },

    // ------------------------------------------------------ panel detalle

    /* Sin panel lateral de detalle en modo reunión. */
    abrirDetalle: function () {},

    cerrarDetalle: function () {},

    /* Filas rótulo/valor para el panel de detalle. */
    detalleFilas: function (filas) {
      const caja = UI.elemento('div', 'col');
      filas.forEach(function (f) {
        if (f.separador) {
          const linea = UI.elemento('div');
          linea.style.borderTop = '1px solid var(--borde)';
          linea.style.margin = '4px 0';
          caja.appendChild(linea);
          return;
        }
        const fila = UI.elemento('div', 'dato-fila');
        fila.appendChild(UI.conAyuda(UI.elemento('span', 'rotulo', f.rotulo), f.rotulo, f.ayuda));
        if (f.nodo) {
          const valor = UI.elemento('span', 'valor');
          valor.appendChild(f.nodo);
          fila.appendChild(valor);
        } else {
          fila.appendChild(UI.elemento('span', 'valor', f.valor));
        }
        caja.appendChild(fila);
      });
      return caja;
    },

    // ------------------------------------------------------------ modal

    alertMessage: function (titulo, mensaje) {
      const previo = document.getElementById('modal');
      if (previo) previo.remove();
      const modal = UI.elemento('div');
      modal.id = 'modal';
      const caja = UI.elemento('div', 'caja');
      caja.appendChild(UI.elemento('h3', null, titulo));
      caja.appendChild(UI.elemento('p', null, mensaje));
      const boton = UI.elemento('button', 'boton boton-primario', 'Entendido');
      boton.onclick = function () {
        modal.remove();
      };
      caja.appendChild(boton);
      modal.appendChild(caja);
      const contenedor = document.getElementById('slide-frame') || document.body;
      contenedor.appendChild(modal);
      boton.focus();
      return modal;
    },

    copyPrompt: function (idElemento) {
      const elemento = document.getElementById(idElemento);
      if (!elemento) return;
      const texto = elemento.innerText;
      const fallback = function () {
        const area = document.createElement('textarea');
        area.value = texto;
        area.style.position = 'absolute';
        area.style.left = '-9999px';
        const contenedor = document.getElementById('slide-frame') || document.body;
        contenedor.appendChild(area);
        area.select();
        try {
          document.execCommand('copy');
          Navegacion.alertMessage('Copiado', 'El texto quedó en el portapapeles.');
        } catch (e) {
          Navegacion.alertMessage('Error al copiar', 'El navegador impidió el acceso al portapapeles.');
        }
        contenedor.removeChild(area);
      };
      if (global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(texto).then(function () {
          Navegacion.alertMessage('Copiado', 'El texto quedó en el portapapeles.');
        }, fallback);
      } else {
        fallback();
      }
    },

    // -------------------------------------------------------- impresión

    /* Arma todas las láminas en #print-root con los filtros activos impresos en
       el encabezado, una por página (§6). */
    imprimir: function () {
      const raiz = document.getElementById('print-root');
      const marcaGraficos = global.Graficos.marcar();
      raiz.innerHTML = '';
      raiz.style.position = 'fixed';
      raiz.style.left = '-100000px';
      raiz.style.top = '0';
      raiz.style.width = '1120px';
      raiz.style.display = 'block';

      const visibles = Navegacion.laminasVisibles();
      visibles.forEach(function (lamina, indice) {
        const hoja = UI.elemento('div', 'hoja');
        hoja.style.height = '620px';
        hoja.style.display = 'flex';
        hoja.style.flexDirection = 'column';
        const encabezado = UI.elemento(
          'div',
          'encabezado-impresion',
          'Lámina ' + (indice + 1) + ' de ' + visibles.length
        );
        hoja.appendChild(encabezado);
        const cuerpo = UI.elemento('div');
        cuerpo.style.flexGrow = '1';
        cuerpo.style.display = 'flex';
        cuerpo.style.flexDirection = 'column';
        cuerpo.style.minHeight = '0';
        hoja.appendChild(cuerpo);
        raiz.appendChild(hoja);
        try {
          lamina.render(cuerpo, Navegacion.ctx);
        } catch (error) {
          cuerpo.appendChild(UI.elemento('div', null, 'No se pudo dibujar esta lámina.'));
        }
      });

      setTimeout(function () {
        global.print();
        setTimeout(function () {
          global.Graficos.limpiarDesde(marcaGraficos);
          raiz.innerHTML = '';
          raiz.style.display = 'none';
        }, 800);
      }, 350);
    },

    // -------------------------------------------------------------- init

    conectarEventos: function () {
      document.addEventListener('keydown', function (evento) {
        if (evento.key === 'ArrowRight' || evento.key === 'PageDown') {
          Navegacion.nextSlide();
          evento.preventDefault();
        } else if (evento.key === 'ArrowLeft' || evento.key === 'PageUp') {
          Navegacion.prevSlide();
          evento.preventDefault();
        } else if (evento.key === 'Home') {
          Navegacion.goToSlide(0);
        } else if (evento.key === 'End') {
          Navegacion.goToSlide(Navegacion.laminasVisibles().length - 1);
        } else if (evento.key === 'f' || evento.key === 'F') {
          Navegacion.toggleFullscreen();
        }
      });

      const alCambiarPantalla = function () {
        const activo = !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
        document.getElementById('txt-fullscreen').textContent = activo ? 'Salir Pantalla' : 'Pantalla Completa';
        document.getElementById('ico-pantalla').innerHTML =
          '<use href="' + (activo ? '#ico-comprimir' : '#ico-expandir') + '"/>';
        // En proyección el texto de los gráficos crece: se vuelve a dibujar.
        global.Graficos.setEscala(activo ? 1.45 : 1);
        Navegacion.renderSlide();
      };
      document.addEventListener('fullscreenchange', alCambiarPantalla);
      document.addEventListener('webkitfullscreenchange', alCambiarPantalla);

      let temporizador = null;
      global.addEventListener('resize', function () {
        clearTimeout(temporizador);
        temporizador = setTimeout(global.Graficos.redimensionar, 120);
      });
    }
  };

  // Funciones globales que usan los onclick de la plantilla y que la skill fija.
  global.UI = UI;
  global.Navegacion = Navegacion;
  global.nextSlide = Navegacion.nextSlide;
  global.prevSlide = Navegacion.prevSlide;
  global.goToSlide = Navegacion.goToSlide;
  global.renderSlide = Navegacion.renderSlide;
  global.initSidebar = Navegacion.initSidebar;
  global.toggleNotesPanel = Navegacion.toggleNotesPanel;
  global.toggleFullscreen = Navegacion.toggleFullscreen;
  global.alertMessage = Navegacion.alertMessage;
  global.copyPrompt = Navegacion.copyPrompt;
  global.cerrarDetalle = Navegacion.cerrarDetalle;
  global.imprimirPresentacion = Navegacion.imprimir;
})(typeof globalThis !== 'undefined' ? globalThis : this);
