/* Barra de filtros global (§5): controles en cascada, etiquetas de lo activo y
   estado reflejado en la URL para poder volver a una vista puntual. */
(function (global) {
  'use strict';

  const Filtros = {
    estado: null,
    motor: null,
    alCambiar: null,
    _abierto: null,

    inicializar: function (motor, alCambiar) {
      Filtros.motor = motor;
      Filtros.alCambiar = alCambiar;
      Filtros.estado = Filtros.estadoInicial();
      Filtros.leerUrl();
      document.addEventListener('click', function (evento) {
        if (Filtros._abierto && !evento.target.closest('.multi')) Filtros.cerrarDesplegables();
      });
      return Filtros.estado;
    },

    estadoInicial: function () {
      const meta = Filtros.motor.datos.meta;
      return {
        periodo: { modo: 'anio', anio: meta.anio_actual },
        jefes: [],
        tiposZona: [],
        localidades: [],
        locales: [],
        grupos: [],
        tipos: [],
        compararAnioAnterior: false,
        mostrarNombres: true
      };
    },

    // ------------------------------------------------------------- cascada

    /* Descarta lo que dejó de existir. Manda el filtro más grueso: primero se
       valida jefe zonal, después localidad y recién al final local, así cambiar
       de jefe suelta el local elegido y no al revés (§5). */
    depurar: function () {
      const e = Filtros.estado;
      const orden = ['tiposZona', 'jefes', 'localidades', 'locales', 'grupos', 'tipos'];
      orden.forEach(function (campo) {
        if (!e[campo].length) return;
        const disponibles = new Set(Filtros.motor.opcionesFiltros(e)[campo]);
        e[campo] = e[campo].filter(function (v) {
          return disponibles.has(v);
        });
      });
    },

    // -------------------------------------------------------------- render

    render: function () {
      Filtros.depurar();
      const contenedor = document.getElementById('controles-filtros');
      contenedor.innerHTML = '';
      const opciones = Filtros.motor.opcionesFiltros(Filtros.estado);
      const Datos = global.Datos;

      contenedor.appendChild(Filtros.controlPeriodo());

      contenedor.appendChild(
        Filtros.multi('Jefe zonal', 'jefes', opciones.jefes, function (i) {
          return Datos.jefe(i);
        })
      );
      contenedor.appendChild(
        Filtros.multi('Tipo de zona', 'tiposZona', opciones.tiposZona, function (i) {
          return Datos.zona(i);
        })
      );
      contenedor.appendChild(
        Filtros.multi('Localidad', 'localidades', opciones.localidades, function (i) {
          return Datos.localidad(i);
        })
      );
      contenedor.appendChild(
        Filtros.multi('Local', 'locales', opciones.locales, function (i) {
          return Datos.local(i);
        })
      );
      if (opciones.grupos && opciones.grupos.length > 1) {
        contenedor.appendChild(
          Filtros.multi('Grupo', 'grupos', opciones.grupos, function (i) {
            return Datos.grupo(i);
          })
        );
      }
      contenedor.appendChild(
        Filtros.multi('Tipo de operación', 'tipos', opciones.tipos, function (i) {
          return Datos.tipo(i);
        })
      );

      if (Datos.hay('anio_anterior')) {
        contenedor.appendChild(
          Filtros.interruptor('Comparar con año anterior', 'compararAnioAnterior', ['No', 'Sí'])
        );
      }
      contenedor.appendChild(Filtros.interruptor('Mostrar cajeros', 'mostrarNombres', ['Solo ID', 'Nombre']));

      const limpiar = document.createElement('button');
      limpiar.className = 'boton boton-chico';
      limpiar.style.marginTop = '13px';
      limpiar.innerHTML = '<svg width="12" height="12"><use href="#ico-limpiar"/></svg> Limpiar filtros';
      limpiar.onclick = function () {
        const mostrar = Filtros.estado.mostrarNombres;
        Filtros.estado = Filtros.estadoInicial();
        Filtros.estado.mostrarNombres = mostrar;
        Filtros.cambio();
      };
      contenedor.appendChild(limpiar);

      Filtros.renderChips();
    },

    controlPeriodo: function () {
      const caja = document.createElement('div');
      caja.className = 'filtro';
      const etiqueta = document.createElement('label');
      etiqueta.textContent = 'Período';
      caja.appendChild(etiqueta);

      const select = document.createElement('select');
      select.className = 'control';
      const periodos = Filtros.motor.periodos;
      const meta = Filtros.motor.datos.meta;
      const Formato = global.Formato;

      const anios = Array.from(new Set(periodos.map((p) => Math.floor(p / 100)))).sort();
      const grupoAnios = document.createElement('optgroup');
      grupoAnios.label = 'Año';
      anios.forEach(function (anio) {
        const opcion = document.createElement('option');
        opcion.value = 'anio:' + anio;
        opcion.textContent = anio === meta.anio_actual ? 'Año ' + anio + ' (a la fecha)' : 'Año ' + anio + ' completo';
        grupoAnios.appendChild(opcion);
      });
      select.appendChild(grupoAnios);

      const grupoTrim = document.createElement('optgroup');
      grupoTrim.label = 'Trimestre';
      Filtros.motor.trimestresCompletos(periodos).forEach(function (t) {
        const opcion = document.createElement('option');
        opcion.value = 'trimestre:' + t.anio + ':' + t.trimestre;
        opcion.textContent = t.etiqueta;
        grupoTrim.appendChild(opcion);
      });
      select.appendChild(grupoTrim);

      const grupoMes = document.createElement('optgroup');
      grupoMes.label = 'Mes';
      periodos.forEach(function (p) {
        const opcion = document.createElement('option');
        opcion.value = 'mes:' + p;
        opcion.textContent = Formato.capitalizar(Formato.mes(p));
        grupoMes.appendChild(opcion);
      });
      select.appendChild(grupoMes);

      const opcionRango = document.createElement('option');
      opcionRango.value = 'rango';
      opcionRango.textContent = 'Rango de meses…';
      select.appendChild(opcionRango);

      const p = Filtros.estado.periodo;
      select.value =
        p.modo === 'anio' ? 'anio:' + p.anio
          : p.modo === 'trimestre' ? 'trimestre:' + p.anio + ':' + p.trimestre
            : p.modo === 'mes' ? 'mes:' + p.desde
              : 'rango';

      select.onchange = function () {
        const partes = select.value.split(':');
        if (partes[0] === 'anio') Filtros.estado.periodo = { modo: 'anio', anio: +partes[1] };
        else if (partes[0] === 'trimestre') Filtros.estado.periodo = { modo: 'trimestre', anio: +partes[1], trimestre: +partes[2] };
        else if (partes[0] === 'mes') Filtros.estado.periodo = { modo: 'mes', desde: +partes[1] };
        else Filtros.estado.periodo = { modo: 'rango', desde: periodos[0], hasta: periodos[periodos.length - 1] };
        Filtros.cambio();
      };
      caja.appendChild(select);

      if (Filtros.estado.periodo.modo === 'rango') {
        const fila = document.createElement('div');
        fila.style.display = 'flex';
        fila.style.gap = '4px';
        fila.style.marginTop = '4px';
        ['desde', 'hasta'].forEach(function (extremo) {
          const sel = document.createElement('select');
          sel.className = 'control';
          sel.style.minWidth = '104px';
          periodos.forEach(function (p2) {
            const opcion = document.createElement('option');
            opcion.value = p2;
            opcion.textContent = Formato.mesCorto(p2);
            sel.appendChild(opcion);
          });
          sel.value = Filtros.estado.periodo[extremo];
          sel.onchange = function () {
            Filtros.estado.periodo[extremo] = +sel.value;
            if (Filtros.estado.periodo.desde > Filtros.estado.periodo.hasta) {
              const a = Filtros.estado.periodo.desde;
              Filtros.estado.periodo.desde = Filtros.estado.periodo.hasta;
              Filtros.estado.periodo.hasta = a;
            }
            Filtros.cambio();
          };
          fila.appendChild(sel);
        });
        caja.appendChild(fila);
      }
      return caja;
    },

    multi: function (titulo, campo, valores, etiquetar) {
      const caja = document.createElement('div');
      caja.className = 'filtro multi';
      const etiqueta = document.createElement('label');
      etiqueta.textContent = titulo;
      caja.appendChild(etiqueta);

      const elegidos = Filtros.estado[campo];
      const boton = document.createElement('button');
      boton.className = 'control';
      boton.style.textAlign = 'left';
      boton.textContent =
        elegidos.length === 0
          ? 'Todos'
          : elegidos.length === 1
            ? etiquetar(elegidos[0])
            : elegidos.length + ' seleccionados';
      boton.title = boton.textContent;
      caja.appendChild(boton);

      boton.onclick = function (evento) {
        evento.stopPropagation();
        if (Filtros._abierto === campo) {
          Filtros.cerrarDesplegables();
          return;
        }
        Filtros.cerrarDesplegables();
        Filtros._abierto = campo;
        const lista = document.createElement('div');
        lista.className = 'multi-lista scroll-fino';

        const buscador = document.createElement('input');
        buscador.className = 'buscador';
        buscador.placeholder = 'Buscar…';
        lista.appendChild(buscador);

        const contenedorOpciones = document.createElement('div');
        lista.appendChild(contenedorOpciones);

        const pintar = function (texto) {
          contenedorOpciones.innerHTML = '';
          const filtro = (texto || '').toLowerCase();
          valores
            .map(function (v) {
              return { valor: v, etiqueta: etiquetar(v) };
            })
            .filter(function (o) {
              return !filtro || o.etiqueta.toLowerCase().includes(filtro);
            })
            .sort(function (a, b) {
              return a.etiqueta.localeCompare(b.etiqueta, 'es');
            })
            .slice(0, 400)
            .forEach(function (o) {
              const fila = document.createElement('label');
              fila.className = 'multi-opcion';
              const check = document.createElement('input');
              check.type = 'checkbox';
              check.checked = Filtros.estado[campo].includes(o.valor);
              check.onchange = function () {
                const actuales = Filtros.estado[campo];
                if (check.checked) actuales.push(o.valor);
                else Filtros.estado[campo] = actuales.filter((x) => x !== o.valor);
                Filtros.cambio(true);
              };
              fila.appendChild(check);
              fila.appendChild(document.createTextNode(o.etiqueta));
              contenedorOpciones.appendChild(fila);
            });
          if (!contenedorOpciones.children.length) {
            contenedorOpciones.innerHTML = '<div class="multi-opcion tenue">Sin opciones</div>';
          }
        };

        buscador.oninput = function () {
          pintar(buscador.value);
        };
        pintar('');

        const acciones = document.createElement('div');
        acciones.className = 'multi-acciones';
        const todos = document.createElement('button');
        todos.className = 'boton boton-chico';
        todos.textContent = 'Todos';
        todos.onclick = function () {
          Filtros.estado[campo] = [];
          Filtros.cambio();
        };
        const cerrar = document.createElement('button');
        cerrar.className = 'boton boton-chico';
        cerrar.textContent = 'Listo';
        cerrar.onclick = function () {
          Filtros.cerrarDesplegables();
        };
        acciones.appendChild(todos);
        acciones.appendChild(cerrar);
        lista.appendChild(acciones);

        caja.appendChild(lista);
        buscador.focus();
      };

      return caja;
    },

    interruptor: function (titulo, campo, etiquetas) {
      const caja = document.createElement('div');
      caja.className = 'filtro';
      const etiqueta = document.createElement('label');
      etiqueta.textContent = titulo;
      caja.appendChild(etiqueta);
      const select = document.createElement('select');
      select.className = 'control';
      select.style.minWidth = '96px';
      [0, 1].forEach(function (i) {
        const opcion = document.createElement('option');
        opcion.value = i ? 'si' : 'no';
        opcion.textContent = etiquetas[i];
        select.appendChild(opcion);
      });
      select.value = Filtros.estado[campo] ? 'si' : 'no';
      select.onchange = function () {
        Filtros.estado[campo] = select.value === 'si';
        Filtros.cambio();
      };
      caja.appendChild(select);
      return caja;
    },

    cerrarDesplegables: function () {
      Filtros._abierto = null;
      document.querySelectorAll('.multi-lista').forEach(function (n) {
        n.remove();
      });
    },

    renderChips: function () {
      const caja = document.getElementById('chips-filtros');
      caja.innerHTML = '';
      const Datos = global.Datos;
      const e = Filtros.estado;
      const chips = [];

      const p = e.periodo;
      let textoPeriodo;
      if (p.modo === 'anio') textoPeriodo = 'Año ' + p.anio;
      else if (p.modo === 'trimestre') textoPeriodo = 'T' + p.trimestre + ' ' + p.anio;
      else if (p.modo === 'mes') textoPeriodo = global.Formato.capitalizar(global.Formato.mes(p.desde));
      else textoPeriodo = global.Formato.mesCorto(p.desde) + ' a ' + global.Formato.mesCorto(p.hasta);
      chips.push({ texto: textoPeriodo, clase: 'chip-info', quitar: null });

      const campos = [
        { campo: 'jefes', titulo: 'Jefe zonal', etiquetar: Datos.jefe },
        { campo: 'tiposZona', titulo: 'Zona', etiquetar: Datos.zona },
        { campo: 'localidades', titulo: 'Localidad', etiquetar: Datos.localidad },
        { campo: 'locales', titulo: 'Local', etiquetar: Datos.local },
        { campo: 'grupos', titulo: 'Grupo', etiquetar: Datos.grupo },
        { campo: 'tipos', titulo: 'Tipo', etiquetar: Datos.tipo }
      ];
      campos.forEach(function (c) {
        e[c.campo].forEach(function (valor) {
          chips.push({
            texto: c.titulo + ': ' + c.etiquetar(valor),
            quitar: function () {
              Filtros.estado[c.campo] = Filtros.estado[c.campo].filter((x) => x !== valor);
              Filtros.cambio();
            }
          });
        });
      });

      if (e.compararAnioAnterior) {
        chips.push({
          texto: 'Comparando con ' + (Filtros.motor.datos.meta.anio_actual - 1),
          clase: 'chip-info',
          quitar: function () {
            Filtros.estado.compararAnioAnterior = false;
            Filtros.cambio();
          }
        });
      }

      if (chips.length === 1) {
        const vacio = document.createElement('span');
        vacio.className = 'tenue';
        vacio.style.fontSize = '11px';
        vacio.textContent = 'Toda la red · ';
        caja.appendChild(vacio);
      }

      chips.forEach(function (c) {
        const chip = document.createElement('span');
        chip.className = 'chip ' + (c.clase || '');
        chip.appendChild(document.createTextNode(c.texto));
        if (c.quitar) {
          const boton = document.createElement('button');
          boton.setAttribute('aria-label', 'Quitar filtro ' + c.texto);
          boton.textContent = '×';
          boton.onclick = c.quitar;
          chip.appendChild(boton);
        }
        caja.appendChild(chip);
      });
    },

    /* Un clic en un jefe zonal, localidad o local dentro de un gráfico aplica
       ese filtro (§5). Si ya estaba solo ese valor, lo suelta. */
    alternar: function (campo, valor) {
      const actuales = Filtros.estado[campo];
      if (actuales.length === 1 && actuales[0] === valor) Filtros.estado[campo] = [];
      else Filtros.estado[campo] = [valor];
      Filtros.cambio();
    },

    cambio: function (mantenerAbierto) {
      if (!mantenerAbierto) Filtros.cerrarDesplegables();
      global.Datos.mostrarNombres = Filtros.estado.mostrarNombres;
      Filtros.escribirUrl();
      Filtros.render();
      if (Filtros.alCambiar) Filtros.alCambiar();
    },

    // ----------------------------------------------------------------- URL

    escribirUrl: function () {
      const e = Filtros.estado;
      const partes = [];
      const p = e.periodo;
      partes.push('p=' + (p.modo === 'anio' ? 'a' + p.anio : p.modo === 'trimestre' ? 't' + p.anio + '-' + p.trimestre : p.modo === 'mes' ? 'm' + p.desde : 'r' + p.desde + '-' + p.hasta));
      ['jefes', 'tiposZona', 'localidades', 'locales', 'grupos', 'tipos'].forEach(function (campo) {
        if (e[campo].length) partes.push(campo + '=' + e[campo].join('.'));
      });
      if (e.compararAnioAnterior) partes.push('comp=1');
      if (!e.mostrarNombres) partes.push('anon=1');
      if (global.Navegacion) partes.push('l=' + (global.Navegacion.indiceActual + 1));
      const hash = '#' + partes.join('&');
      if (global.location.hash !== hash) {
        global.history.replaceState(null, '', hash);
      }
    },

    leerUrl: function () {
      const hash = global.location.hash.replace(/^#/, '');
      if (!hash) return;
      const e = Filtros.estado;
      hash.split('&').forEach(function (parte) {
        const igual = parte.indexOf('=');
        if (igual < 0) return;
        const clave = parte.slice(0, igual);
        const valor = parte.slice(igual + 1);
        if (clave === 'p') {
          if (valor[0] === 'a') e.periodo = { modo: 'anio', anio: +valor.slice(1) };
          else if (valor[0] === 't') {
            const t = valor.slice(1).split('-');
            e.periodo = { modo: 'trimestre', anio: +t[0], trimestre: +t[1] };
          } else if (valor[0] === 'm') e.periodo = { modo: 'mes', desde: +valor.slice(1) };
          else if (valor[0] === 'r') {
            const r = valor.slice(1).split('-');
            e.periodo = { modo: 'rango', desde: +r[0], hasta: +r[1] };
          }
        } else if (['jefes', 'tiposZona', 'localidades', 'locales', 'grupos', 'tipos'].includes(clave)) {
          e[clave] = valor.split('.').map(Number).filter((n) => !Number.isNaN(n));
        } else if (clave === 'comp') e.compararAnioAnterior = valor === '1';
        else if (clave === 'anon') e.mostrarNombres = valor !== '1';
        else if (clave === 'l') Filtros.laminaInicial = +valor;
      });
      global.Datos.mostrarNombres = e.mostrarNombres;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Filtros;
  else global.Filtros = Filtros;
})(typeof globalThis !== 'undefined' ? globalThis : this);
