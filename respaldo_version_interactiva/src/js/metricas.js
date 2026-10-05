/* Motor de métricas. Sin DOM: se puede requerir desde Node para las pruebas.
   Las definiciones están en Requerimiento.md §4 y las desviaciones en DECISIONES.md. */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- utilidades

  function suma(arr) {
    let t = 0;
    for (let i = 0; i < arr.length; i++) t += arr[i];
    return t;
  }

  function periodoANumero(anio, mes) {
    return anio * 100 + mes;
  }

  function anioDe(periodo) {
    return Math.floor(periodo / 100);
  }

  function mesDe(periodo) {
    return periodo % 100;
  }

  function trimestreDe(periodo) {
    return Math.floor((mesDe(periodo) - 1) / 3) + 1;
  }

  function finDeMes(periodo) {
    const anio = anioDe(periodo);
    const mes = mesDe(periodo);
    const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    return anio * 10000 + mes * 100 + dias;
  }

  function inicioDeMes(periodo) {
    return anioDe(periodo) * 10000 + mesDe(periodo) * 100 + 1;
  }

  /* Percentil de cada valor dentro de su grupo, 0 a 100.
     Rango medio para los empates: dos cajeros con el mismo IP tienen el mismo percentil. */
  function percentiles(valores) {
    const n = valores.length;
    const salida = new Array(n).fill(0);
    if (n === 0) return salida;
    if (n === 1) return [50];
    const orden = valores.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && orden[j + 1][0] === orden[i][0]) j++;
      // posición media del bloque de empatados, escalada a 0-100
      const pos = (i + j) / 2;
      const p = (pos / (n - 1)) * 100;
      for (let k = i; k <= j; k++) salida[orden[k][1]] = p;
      i = j + 1;
    }
    return salida;
  }

  /* Valor del percentil p (0-100) sobre una lista ordenada, interpolando. */
  function valorEnPercentil(ordenados, p) {
    if (ordenados.length === 0) return null;
    if (ordenados.length === 1) return ordenados[0];
    const pos = (p / 100) * (ordenados.length - 1);
    const bajo = Math.floor(pos);
    const alto = Math.ceil(pos);
    if (bajo === alto) return ordenados[bajo];
    return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo);
  }

  function mapaIncrementar(mapa, clave, cantidad) {
    mapa.set(clave, (mapa.get(clave) || 0) + cantidad);
  }

  // ------------------------------------------------------------------- motor

  function crearMotor(datos, configExterna) {
    const config = configExterna || datos.config;
    const tx = datos.tx;
    const locales = datos.dim.locales;
    const cajeros = datos.dim.cajeros;
    const nFilas = tx.periodo.length;
    const nCajeros = cajeros.id.length;
    const nLocales = locales.id.length;

    const periodos = datos.meta.periodos.slice().sort((a, b) => a - b);
    const posPeriodo = new Map(periodos.map((p, i) => [p, i]));

    const tieneRechazos = !!tx.rechazadas;
    const tieneGrupo = !!tx.grupo;

    // Filas por cajero y por período: evita recorrer las 44k filas por cajero.
    const filasPorCajero = Array.from({ length: nCajeros }, () => []);
    for (let f = 0; f < nFilas; f++) filasPorCajero[tx.cajero[f]].push(f);

    const asignadosPorLocal = Array.from({ length: nLocales }, () => []);
    for (let c = 0; c < nCajeros; c++) {
      const l = cajeros.local_actual[c];
      if (l >= 0 && l < nLocales) asignadosPorLocal[l].push(c);
    }

    const minMesesPeriodo = config.productividad.minimo_meses_activos;
    const minMesesTrimestre = config.productividad.minimo_meses_activos_trimestre;
    const corteBajo = config.productividad.percentil_corte_bajo;
    const corteAlto = config.productividad.percentil_corte_alto;

    // ------------------------------------------------------ estado del cajero

    function habilitadoEn(c, periodo) {
      const alta = cajeros.alta[c];
      const baja = cajeros.baja[c];
      if (alta && alta > finDeMes(periodo)) return false;
      if (baja && baja < inicioDeMes(periodo)) return false;
      return true;
    }

    function mesesHabilitado(c, lista) {
      let n = 0;
      for (let i = 0; i < lista.length; i++) if (habilitadoEn(c, lista[i])) n++;
      return n;
    }

    // ------------------------------------------- categorías (toda la red, §4.6)

    const memoCategorias = new Map();

    /* Categorías de productividad de TODA la red para un conjunto de períodos.
       No depende de ningún otro filtro: ese es el invariante de §4.6. */
    function categorias(lista, minMeses) {
      const min = minMeses === undefined ? minMesesPeriodo : minMeses;
      const clave = min + '|' + lista.join(',');
      if (memoCategorias.has(clave)) return memoCategorias.get(clave);

      const enPeriodo = new Set(lista);
      const ops = new Float64Array(nCajeros);
      const mesesActivos = new Int32Array(nCajeros);
      const zonaPorCajero = new Int8Array(nCajeros).fill(-1);

      for (let c = 0; c < nCajeros; c++) {
        const filas = filasPorCajero[c];
        const meses = new Set();
        const opsPorLocal = new Map();
        for (let i = 0; i < filas.length; i++) {
          const f = filas[i];
          if (!enPeriodo.has(tx.periodo[f])) continue;
          const cant = tx.cantidad[f];
          ops[c] += cant;
          if (cant > 0) meses.add(tx.periodo[f]);
          mapaIncrementar(opsPorLocal, tx.local[f], cant);
        }
        mesesActivos[c] = meses.size;
        // Tipo de zona del cajero: el del local donde hizo más operaciones (D-19).
        let mejorLocal = -1;
        let mejorOps = -1;
        opsPorLocal.forEach((v, k) => {
          if (v > mejorOps) {
            mejorOps = v;
            mejorLocal = k;
          }
        });
        if (mejorLocal < 0) mejorLocal = cajeros.local_actual[c];
        zonaPorCajero[c] = mejorLocal >= 0 ? locales.tipo_zona[mejorLocal] : -1;
      }

      const ip = new Float64Array(nCajeros);
      const suficiente = new Uint8Array(nCajeros);
      for (let c = 0; c < nCajeros; c++) {
        ip[c] = mesesActivos[c] > 0 ? ops[c] / mesesActivos[c] : 0;
        suficiente[c] = mesesActivos[c] >= min ? 1 : 0;
      }

      // Percentil y categoría dentro del tipo de zona, solo entre los que tienen datos suficientes.
      const percentil = new Float64Array(nCajeros).fill(NaN);
      const categoria = new Array(nCajeros).fill('sin_datos');
      const umbrales = {};

      [0, 1].forEach(function (zona) {
        const idx = [];
        for (let c = 0; c < nCajeros; c++) {
          if (suficiente[c] && zonaPorCajero[c] === zona) idx.push(c);
        }
        if (idx.length === 0) {
          umbrales[zona] = { corteBajo: null, corteAlto: null, cajeros: 0 };
          return;
        }
        const ips = idx.map((c) => ip[c]);
        const pcts = percentiles(ips);
        idx.forEach(function (c, i) {
          percentil[c] = pcts[i];
          categoria[c] = pcts[i] >= corteAlto ? 'alta' : pcts[i] >= corteBajo ? 'media' : 'baja';
        });
        const ordenados = ips.slice().sort((a, b) => a - b);
        umbrales[zona] = {
          corteBajo: valorEnPercentil(ordenados, corteBajo),
          corteAlto: valorEnPercentil(ordenados, corteAlto),
          cajeros: idx.length,
          ipMin: ordenados[0],
          ipMax: ordenados[ordenados.length - 1],
          ipMediana: valorEnPercentil(ordenados, 50)
        };
      });

      const resultado = {
        periodos: lista,
        minimoMeses: min,
        ops: ops,
        mesesActivos: mesesActivos,
        mesesHabilitado: Int32Array.from({ length: nCajeros }, (_, c) => mesesHabilitado(c, lista)),
        zona: zonaPorCajero,
        ip: ip,
        suficiente: suficiente,
        percentil: percentil,
        categoria: categoria,
        umbrales: umbrales
      };
      memoCategorias.set(clave, resultado);
      return resultado;
    }

    // --------------------------------------------------------------- períodos

    /* Ventanas de comparación: los primeros k meses del período contra los
       últimos k, con k = 3 o la mitad del período si es más corto.

       No se usan trimestres calendario a propósito: con datos hasta agosto, el
       T3 está incompleto y quedarían afuera julio y agosto, que son los dos
       meses más recientes. Las ventanas móviles siempre incluyen el final del
       período, sea cual sea el recorte elegido. */
    function ventanaComparacion(lista) {
      if (!lista || lista.length < 2) return null;
      const k = Math.min(3, Math.floor(lista.length / 2));
      if (k < 1) return null;
      return {
        meses: k,
        inicio: lista.slice(0, k),
        fin: lista.slice(lista.length - k)
      };
    }

    function trimestresCompletos(lista) {
      const porTrimestre = new Map();
      lista.forEach(function (p) {
        const clave = anioDe(p) * 10 + trimestreDe(p);
        if (!porTrimestre.has(clave)) porTrimestre.set(clave, []);
        porTrimestre.get(clave).push(p);
      });
      const salida = [];
      porTrimestre.forEach(function (meses, clave) {
        if (meses.length === 3) {
          salida.push({
            clave: clave,
            anio: Math.floor(clave / 10),
            trimestre: clave % 10,
            etiqueta: 'T' + (clave % 10) + ' ' + Math.floor(clave / 10),
            periodos: meses.slice().sort((a, b) => a - b)
          });
        }
      });
      return salida.sort((a, b) => a.clave - b.clave);
    }

    function resolverPeriodo(filtro) {
      const f = filtro || {};
      let lista;
      if (f.modo === 'mes' && f.desde) {
        lista = periodos.filter((p) => p === f.desde);
      } else if (f.modo === 'trimestre' && f.anio && f.trimestre) {
        lista = periodos.filter((p) => anioDe(p) === f.anio && trimestreDe(p) === f.trimestre);
      } else if (f.modo === 'rango' && f.desde && f.hasta) {
        lista = periodos.filter((p) => p >= f.desde && p <= f.hasta);
      } else {
        const anio = f.anio || datos.meta.anio_actual;
        lista = periodos.filter((p) => anioDe(p) === anio && p <= datos.meta.periodo_corte);
      }
      return lista.slice().sort((a, b) => a - b);
    }

    function periodosAnioAnterior(lista) {
      const previos = lista.map((p) => p - 100).filter((p) => posPeriodo.has(p));
      return previos.length === lista.length ? previos : previos.length ? previos : null;
    }

    // ---------------------------------------------------------------- filtros

    function filasDe(lista, filtros) {
      const enPeriodo = new Set(lista);
      const f = filtros || {};
      const jefes = f.jefes && f.jefes.length ? new Set(f.jefes) : null;
      const zonas = f.tiposZona && f.tiposZona.length ? new Set(f.tiposZona) : null;
      const localidades = f.localidades && f.localidades.length ? new Set(f.localidades) : null;
      const localesSel = f.locales && f.locales.length ? new Set(f.locales) : null;
      const tipos = f.tipos && f.tipos.length ? new Set(f.tipos) : null;
      const grupos = f.grupos && f.grupos.length ? new Set(f.grupos) : null;

      const salida = [];
      for (let i = 0; i < nFilas; i++) {
        if (!enPeriodo.has(tx.periodo[i])) continue;
        const l = tx.local[i];
        if (jefes && !jefes.has(locales.jefe[l])) continue;
        if (zonas && !zonas.has(locales.tipo_zona[l])) continue;
        if (localidades && !localidades.has(locales.localidad[l])) continue;
        if (localesSel && !localesSel.has(l)) continue;
        if (grupos && tieneGrupo && !grupos.has(tx.grupo[i])) continue;
        if (tipos && !tipos.has(tx.tipo[i])) continue;
        salida.push(i);
      }
      return salida;
    }

    /* Locales que pasan los filtros de estructura, sin mirar transacciones:
       hace falta para contar locales y cajeros habilitados aunque no hayan operado. */
    function localesDe(filtros) {
      const f = filtros || {};
      const jefes = f.jefes && f.jefes.length ? new Set(f.jefes) : null;
      const zonas = f.tiposZona && f.tiposZona.length ? new Set(f.tiposZona) : null;
      const localidades = f.localidades && f.localidades.length ? new Set(f.localidades) : null;
      const localesSel = f.locales && f.locales.length ? new Set(f.locales) : null;
      const salida = [];
      for (let l = 0; l < nLocales; l++) {
        if (jefes && !jefes.has(locales.jefe[l])) continue;
        if (zonas && !zonas.has(locales.tipo_zona[l])) continue;
        if (localidades && !localidades.has(locales.localidad[l])) continue;
        if (localesSel && !localesSel.has(l)) continue;
        salida.push(l);
      }
      return salida;
    }

    // --------------------------------------------------------------- contexto

    function contexto(estado) {
      const lista = resolverPeriodo(estado.periodo);
      const filas = filasDe(lista, estado);
      const localesVisibles = localesDe(estado);
      const setLocales = new Set(localesVisibles);
      const cats = categorias(lista);
      const memo = new Map();

      function cacheado(clave, fn) {
        if (!memo.has(clave)) memo.set(clave, fn());
        return memo.get(clave);
      }

      const ctx = {
        periodos: lista,
        filas: filas,
        localesVisibles: localesVisibles,
        categorias: cats,
        estado: estado,
        vacio: filas.length === 0,

        /* Agrupa las filas filtradas por una clave calculada sobre la fila. */
        agrupar: function (claveFn) {
          const mapa = new Map();
          for (let i = 0; i < filas.length; i++) {
            const f = filas[i];
            const k = claveFn(f);
            if (k === null || k === undefined) continue;
            let acc = mapa.get(k);
            if (!acc) {
              acc = { clave: k, ops: 0, rechazadas: 0, filas: 0 };
              mapa.set(k, acc);
            }
            acc.ops += tx.cantidad[f];
            acc.filas++;
            if (tieneRechazos) acc.rechazadas += tx.rechazadas[f];
          }
          return mapa;
        },

        totales: function () {
          return cacheado('totales', function () {
            let ops = 0;
            let rechazadas = 0;
            for (let i = 0; i < filas.length; i++) {
              const f = filas[i];
              ops += tx.cantidad[f];
              if (tieneRechazos) rechazadas += tx.rechazadas[f];
            }
            return { ops: ops, rechazadas: rechazadas };
          });
        },

        /* Serie mensual con la dotación de cada mes: habilitados, activos e
           inactivos (§4.2). Es la base de las láminas de actividad. */
        porMes: function () {
          return cacheado('porMes', function () {
            const mapa = ctx.agrupar((f) => tx.periodo[f]);
            const habilitados = ctx.cajerosHabilitadosPorMes();
            const activosGlobal = ctx.cajerosActivosGlobalPorMes();
            return lista.map(function (p) {
              const a = mapa.get(p) || { ops: 0, rechazadas: 0 };
              const activos = ctx.cajerosActivosPorMes().get(p) || 0;
              const conActividad = activosGlobal.get(p) || 0;
              const habil = habilitados.get(p) || 0;
              return {
                periodo: p,
                ops: a.ops,
                rechazadas: a.rechazadas,
                // activos en el recorte (los que operaron lo que se está mirando)
                cajerosActivos: activos,
                // con actividad en cualquier lado: es lo que define la inactividad
                cajerosConActividad: conActividad,
                cajerosHabilitados: habil,
                cajerosInactivos: Math.max(0, habil - conActividad),
                porcentajeInactivos: habil > 0 ? ((habil - conActividad) / habil) * 100 : 0
              };
            });
          });
        },

        porGrupo: function () {
          return cacheado('porGrupo', function () {
            return ctx.agrupar(function (f) {
              return tieneGrupo ? tx.grupo[f] : 0;
            });
          });
        },

        porJefe: function () {
          return cacheado('porJefe', function () {
            return ctx.agrupar((f) => locales.jefe[tx.local[f]]);
          });
        },

        porLocal: function () {
          return cacheado('porLocal', function () {
            return ctx.agrupar((f) => tx.local[f]);
          });
        },

        porLocalidad: function () {
          return cacheado('porLocalidad', function () {
            return ctx.agrupar((f) => locales.localidad[tx.local[f]]);
          });
        },

        porTipo: function () {
          return cacheado('porTipo', function () {
            return ctx.agrupar((f) => tx.tipo[f]);
          });
        },

        porCajero: function () {
          return cacheado('porCajero', function () {
            return ctx.agrupar((f) => tx.cajero[f]);
          });
        },

        porZona: function () {
          return cacheado('porZona', function () {
            return ctx.agrupar((f) => locales.tipo_zona[tx.local[f]]);
          });
        },

        /* Cajeros con al menos una operación en cada mes del período, ya filtrados. */
        cajerosActivosPorMes: function () {
          return cacheado('activosPorMes', function () {
            const porMes = new Map();
            lista.forEach((p) => porMes.set(p, new Set()));
            for (let i = 0; i < filas.length; i++) {
              const f = filas[i];
              if (tx.cantidad[f] > 0) porMes.get(tx.periodo[f]).add(tx.cajero[f]);
            }
            const salida = new Map();
            porMes.forEach((set, p) => salida.set(p, set.size));
            return salida;
          });
        },

        /* Actividad real del cajero, sin mirar los filtros: un cajero que ese mes
           operó en otra zona o en otro grupo trabajó igual. Es lo que hace que
           "sin actividad" signifique lo mismo en la red y en una zona, en vez de
           contar como inactivo a quien se movió de local. */
        cajerosActivosGlobalPorMes: function () {
          return cacheado('activosGlobalPorMes', function () {
            const delRecorte = ctx.cajerosDelRecorte();
            const porMes = new Map();
            lista.forEach((p) => porMes.set(p, new Set()));
            for (let f = 0; f < nFilas; f++) {
              if (tx.cantidad[f] <= 0) continue;
              const p = tx.periodo[f];
              if (!porMes.has(p)) continue;
              const c = tx.cajero[f];
              if (delRecorte.has(c)) porMes.get(p).add(c);
            }
            const salida = new Map();
            porMes.forEach((set, p) => salida.set(p, set.size));
            return salida;
          });
        },

        cajerosActivosSetPorMes: function () {
          return cacheado('activosSetPorMes', function () {
            const porMes = new Map();
            lista.forEach((p) => porMes.set(p, new Set()));
            for (let i = 0; i < filas.length; i++) {
              const f = filas[i];
              if (tx.cantidad[f] > 0) porMes.get(tx.periodo[f]).add(tx.cajero[f]);
            }
            return porMes;
          });
        },

        /* Cajeros habilitados mes a mes dentro del recorte (§4.2). Es la
           dotación contra la que se mide la actividad: un cajero dado de alta en
           junio no cuenta como inactivo en mayo. */
        cajerosHabilitadosPorMes: function () {
          return cacheado('habilitadosPorMes', function () {
            const delRecorte = ctx.cajerosDelRecorte();
            const salida = new Map();
            lista.forEach(function (p) {
              let n = 0;
              delRecorte.forEach(function (c) {
                if (habilitadoEn(c, p)) n++;
              });
              salida.set(p, n);
            });
            return salida;
          });
        },

        /* Promedios de dotación del período: es lo que se muestra como "cajeros",
           en lugar de un total acumulado de legajos distintos. */
        dotacion: function () {
          return cacheado('dotacion', function () {
            const meses = ctx.porMes();
            if (!meses.length) {
              return { habilitadosPromedio: 0, activosPromedio: 0, inactivosPromedio: 0, porcentajeInactivos: 0, cajerosDistintos: 0 };
            }
            const suma = function (campo) {
              return meses.reduce(function (acc, m) {
                return acc + m[campo];
              }, 0);
            };
            const habil = suma('cajerosHabilitados') / meses.length;
            const activos = suma('cajerosConActividad') / meses.length;
            return {
              habilitadosPromedio: habil,
              activosPromedio: activos,
              activosEnElRecortePromedio: suma('cajerosActivos') / meses.length,
              inactivosPromedio: Math.max(0, habil - activos),
              porcentajeInactivos: habil > 0 ? ((habil - activos) / habil) * 100 : 0,
              cajerosDistintos: ctx.cajerosHabilitados().length
            };
          });
        },

        /* Cajeros habilitados del recorte: los asignados a un local visible, más
           los que operaron en un local visible durante el período. */
        cajerosDelRecorte: function () {
          return cacheado('cajerosRecorte', function () {
            const set = new Set();
            for (let c = 0; c < nCajeros; c++) {
              const l = cajeros.local_actual[c];
              if (l >= 0 && setLocales.has(l)) set.add(c);
            }
            for (let i = 0; i < filas.length; i++) set.add(tx.cajero[filas[i]]);
            return set;
          });
        },

        cajerosHabilitados: function () {
          return cacheado('cajerosHabilitados', function () {
            const salida = [];
            ctx.cajerosDelRecorte().forEach(function (c) {
              for (let i = 0; i < lista.length; i++) {
                if (habilitadoEn(c, lista[i])) {
                  salida.push(c);
                  return;
                }
              }
            });
            return salida;
          });
        },

        /* Métricas por cajero del recorte: operaciones filtradas + categoría de red. */
        metricasCajeros: function () {
          return cacheado('metricasCajeros', function () {
            const porCajero = ctx.porCajero();
            const mesesConOps = new Map();
            for (let i = 0; i < filas.length; i++) {
              const f = filas[i];
              if (tx.cantidad[f] <= 0) continue;
              const c = tx.cajero[f];
              if (!mesesConOps.has(c)) mesesConOps.set(c, new Set());
              mesesConOps.get(c).add(tx.periodo[f]);
            }
            const salida = [];
            ctx.cajerosHabilitados().forEach(function (c) {
              const agg = porCajero.get(c) || { ops: 0, rechazadas: 0 };
              const meses = mesesConOps.has(c) ? mesesConOps.get(c).size : 0;
              const habil = cats.mesesHabilitado[c];
              salida.push({
                cajero: c,
                id: cajeros.id[c],
                nombre: cajeros.nombre[c],
                local: cajeros.local_actual[c],
                ops: agg.ops,
                rechazadas: agg.rechazadas,
                mesesActivosFiltrados: meses,
                mesesActivos: cats.mesesActivos[c],
                mesesHabilitado: habil,
                porcentajeMesesActivos: habil > 0 ? (cats.mesesActivos[c] / habil) * 100 : 0,
                ip: cats.ip[c],
                percentil: cats.percentil[c],
                categoria: cats.categoria[c],
                suficiente: !!cats.suficiente[c],
                zona: cats.zona[c],
                activo: meses > 0
              });
            });
            return salida;
          });
        },

        /* IP promedio de los cajeros con datos suficientes de cada local, y su
           categoría comparada contra los locales del mismo tipo de zona (§4.7). */
        metricasLocales: function () {
          return cacheado('metricasLocales', function () {
            const agg = ctx.porLocal();
            const cajerosPorLocal = new Map();
            // Meses con actividad de cada local: es lo que separa un local flojo
            // de una apertura reciente o de un cierre a mitad de año.
            const mesesPorLocal = new Map();
            for (let i = 0; i < filas.length; i++) {
              const f = filas[i];
              const l = tx.local[f];
              if (!cajerosPorLocal.has(l)) cajerosPorLocal.set(l, new Map());
              mapaIncrementar(cajerosPorLocal.get(l), tx.cajero[f], tx.cantidad[f]);
              if (tx.cantidad[f] > 0) {
                if (!mesesPorLocal.has(l)) mesesPorLocal.set(l, new Set());
                mesesPorLocal.get(l).add(tx.periodo[f]);
              }
            }
            const filasLocales = localesVisibles.map(function (l) {
              const a = agg.get(l) || { ops: 0, rechazadas: 0 };
              const suyos = cajerosPorLocal.get(l) || new Map();
              let sumaIp = 0;
              let conDatos = 0;
              let activos = 0;
              suyos.forEach(function (ops, c) {
                if (ops > 0) activos++;
                if (cats.suficiente[c]) {
                  sumaIp += cats.ip[c];
                  conDatos++;
                }
              });
              // Universo del local: los asignados hoy más los que operaron ahí en el
              // período. Si se contaran solo los asignados, un local donde opera
              // gente de otro local podía dar más activos que habilitados.
              const asociados = new Set(asignadosPorLocal[l]);
              suyos.forEach((_, c) => asociados.add(c));
              const habilitados = [];
              asociados.forEach(function (c) {
                if (lista.some((p) => habilitadoEn(c, p))) habilitados.push(c);
              });
              return {
                local: l,
                id: locales.id[l],
                nombre: locales.nombre[l],
                localidad: locales.localidad[l],
                provincia: locales.provincia[l],
                jefe: locales.jefe[l],
                zona: locales.tipo_zona[l],
                ops: a.ops,
                rechazadas: a.rechazadas,
                mesesActivos: mesesPorLocal.has(l) ? mesesPorLocal.get(l).size : 0,
                cajerosConOps: suyos.size,
                cajerosActivos: activos,
                cajerosHabilitados: habilitados.length,
                cajerosConDatos: conDatos,
                ipPromedio: conDatos > 0 ? sumaIp / conDatos : null,
                opsPorCajero: activos > 0 ? a.ops / activos : 0,
                porcentajeInactivos:
                  habilitados.length > 0
                    ? ((habilitados.length - activos) / habilitados.length) * 100
                    : 0
              };
            });

            // Categoría del local: tercios dentro de su tipo de zona (§4.7).
            [0, 1].forEach(function (zona) {
              const conIp = filasLocales.filter((r) => r.zona === zona && r.ipPromedio !== null);
              if (!conIp.length) return;
              const pcts = percentiles(conIp.map((r) => r.ipPromedio));
              conIp.forEach(function (r, i) {
                r.percentil = pcts[i];
                r.categoria = pcts[i] >= corteAlto ? 'alta' : pcts[i] >= corteBajo ? 'media' : 'baja';
              });
            });
            filasLocales.forEach(function (r) {
              if (!r.categoria) {
                r.categoria = 'sin_datos';
                r.percentil = null;
              }
            });
            return filasLocales;
          });
        },

        /* Serie mensual por jefe zonal: operaciones, operadores distintos y
           locales activos de cada zona en cada mes del período. Es la base de
           las láminas de avance: todo lo demás se deriva de acá. */
        seriePorJefe: function () {
          return cacheado('seriePorJefe', function () {
            const porJefe = new Map();
            const indice = new Map(lista.map((p, i) => [p, i]));
            for (let i = 0; i < filas.length; i++) {
              const f = filas[i];
              const jefe = locales.jefe[tx.local[f]];
              const pos = indice.get(tx.periodo[f]);
              if (pos === undefined) continue;
              if (!porJefe.has(jefe)) {
                porJefe.set(
                  jefe,
                  lista.map(function () {
                    return { ops: 0, operadores: new Set(), locales: new Set() };
                  })
                );
              }
              const mes = porJefe.get(jefe)[pos];
              mes.ops += tx.cantidad[f];
              if (tx.cantidad[f] > 0) {
                mes.operadores.add(tx.cajero[f]);
                mes.locales.add(tx.local[f]);
              }
            }
            return porJefe;
          });
        },

        /* Avance de cada zona: la ventana inicial contra la final, con las
           métricas normalizadas por tamaño (por operador y por local) para que
           zonas de distinto porte sean comparables, y cada zona medida contra
           sí misma. */
        avancePorJefe: function () {
          return cacheado('avancePorJefe', function () {
            const ventana = ventanaComparacion(lista);
            const serie = ctx.seriePorJefe();
            const posiciones = new Map(lista.map((p, i) => [p, i]));

            const acumular = function (meses, periodos) {
              let ops = 0;
              const operadores = new Set();
              const localesActivos = new Set();
              periodos.forEach(function (p) {
                const mes = meses[posiciones.get(p)];
                if (!mes) return;
                ops += mes.ops;
                mes.operadores.forEach((c) => operadores.add(c));
                mes.locales.forEach((l) => localesActivos.add(l));
              });
              return {
                ops: ops,
                operadores: operadores.size,
                locales: localesActivos.size,
                opsPorOperador: operadores.size ? ops / operadores.size : 0,
                opsPorLocal: localesActivos.size ? ops / localesActivos.size : 0,
                opsPorMes: periodos.length ? ops / periodos.length : 0
              };
            };

            const variacion = function (antes, despues) {
              return antes > 0 ? ((despues - antes) / antes) * 100 : null;
            };

            const salida = [];
            serie.forEach(function (meses, jefe) {
              const total = acumular(meses, lista);
              const fila = {
                jefe: jefe,
                total: total,
                ventana: ventana,
                serieOps: meses.map((m) => m.ops),
                serieOperadores: meses.map((m) => m.operadores.size),
                serieOpsPorOperador: meses.map(function (m) {
                  return m.operadores.size ? m.ops / m.operadores.size : 0;
                })
              };
              if (ventana) {
                fila.inicio = acumular(meses, ventana.inicio);
                fila.fin = acumular(meses, ventana.fin);
                fila.varOps = variacion(fila.inicio.ops, fila.fin.ops);
                fila.varOperadores = variacion(fila.inicio.operadores, fila.fin.operadores);
                fila.varOpsPorOperador = variacion(fila.inicio.opsPorOperador, fila.fin.opsPorOperador);
                fila.varOpsPorLocal = variacion(fila.inicio.opsPorLocal, fila.fin.opsPorLocal);
              }
              salida.push(fila);
            });
            return { ventana: ventana, filas: salida };
          });
        },

        /* Lo mismo para toda la red, que es la línea de referencia. */
        avanceRed: function () {
          return cacheado('avanceRed', function () {
            const ventana = ventanaComparacion(lista);
            const porMes = ctx.porMes();
            const setPorMes = ctx.cajerosActivosSetPorMes();
            const posiciones = new Map(lista.map((p, i) => [p, i]));

            const acumular = function (periodos) {
              let ops = 0;
              const operadores = new Set();
              periodos.forEach(function (p) {
                ops += porMes[posiciones.get(p)].ops;
                (setPorMes.get(p) || new Set()).forEach((c) => operadores.add(c));
              });
              return {
                ops: ops,
                operadores: operadores.size,
                opsPorOperador: operadores.size ? ops / operadores.size : 0
              };
            };

            if (!ventana) return { ventana: null };
            const inicio = acumular(ventana.inicio);
            const fin = acumular(ventana.fin);
            return {
              ventana: ventana,
              inicio: inicio,
              fin: fin,
              varOps: inicio.ops > 0 ? ((fin.ops - inicio.ops) / inicio.ops) * 100 : null,
              varOpsPorOperador:
                inicio.opsPorOperador > 0
                  ? ((fin.opsPorOperador - inicio.opsPorOperador) / inicio.opsPorOperador) * 100
                  : null,
              varOperadores: inicio.operadores > 0 ? ((fin.operadores - inicio.operadores) / inicio.operadores) * 100 : null
            };
          });
        },

        /* Reparto de cajeros por categoría, sobre los cajeros visibles (§9). */
        conteoCategorias: function () {
          return cacheado('conteoCategorias', function () {
            const conteo = { alta: 0, media: 0, baja: 0, sin_datos: 0 };
            ctx.metricasCajeros().forEach(function (m) {
              conteo[m.categoria]++;
            });
            return conteo;
          });
        },

        /* §4.11 — porcentaje de operaciones que concentra el X% de cajeros con más operaciones. */
        concentracion: function () {
          return cacheado('concentracion', function () {
            const porc = config.concentracion.porcentaje_cajeros;
            const ops = [];
            ctx.porCajero().forEach((a) => ops.push(a.ops));
            ops.sort((a, b) => b - a);
            const total = suma(ops);
            const corte = Math.max(1, Math.round((ops.length * porc) / 100));
            let acumulado = 0;
            const curva = [];
            for (let i = 0; i < ops.length; i++) {
              acumulado += ops[i];
              curva.push({
                cajeros: i + 1,
                porcentajeCajeros: ((i + 1) / ops.length) * 100,
                porcentajeOps: total > 0 ? (acumulado / total) * 100 : 0
              });
            }
            const opsTop = suma(ops.slice(0, corte));
            return {
              porcentajeCajeros: porc,
              cajerosTop: corte,
              cajerosTotal: ops.length,
              porcentajeOps: total > 0 ? (opsTop / total) * 100 : 0,
              curva: curva
            };
          });
        }
      };

      return ctx;
    }

    // -------------------------------------------- comparación con año anterior

    function comparativoAnual(estado) {
      const lista = resolverPeriodo(estado.periodo);
      const previos = periodosAnioAnterior(lista);
      if (!previos || !previos.length) return null;
      const actual = contexto(estado).totales();
      const anterior = contexto(
        Object.assign({}, estado, { periodo: { modo: 'rango', desde: previos[0], hasta: previos[previos.length - 1] } })
      ).totales();
      return {
        actual: actual,
        anterior: anterior,
        variacionOps: anterior.ops > 0 ? ((actual.ops - anterior.ops) / anterior.ops) * 100 : null
      };
    }

    // ------------------------------------------------ mejora entre trimestres

    /* §4.8 — diferencia de percentil de IP dentro del tipo de zona entre el
       primer y el último trimestre completo del período. */
    function mejora(lista) {
      const trimestres = trimestresCompletos(lista);
      if (trimestres.length < 2) return { disponible: false, trimestres: trimestres, cajeros: [] };
      const primero = trimestres[0];
      const ultimo = trimestres[trimestres.length - 1];
      const catP = categorias(primero.periodos, minMesesTrimestre);
      const catU = categorias(ultimo.periodos, minMesesTrimestre);
      const salida = [];
      for (let c = 0; c < nCajeros; c++) {
        if (!catP.suficiente[c] || !catU.suficiente[c]) continue;
        salida.push({
          cajero: c,
          id: cajeros.id[c],
          nombre: cajeros.nombre[c],
          percentilInicial: catP.percentil[c],
          percentilFinal: catU.percentil[c],
          mejora: catU.percentil[c] - catP.percentil[c],
          ipInicial: catP.ip[c],
          ipFinal: catU.ip[c],
          categoriaInicial: catP.categoria[c],
          categoriaFinal: catU.categoria[c],
          zona: catU.zona[c]
        });
      }
      return { disponible: true, primero: primero, ultimo: ultimo, trimestres: trimestres, cajeros: salida };
    }

    /* §7.5 láminas 25-27 — categoría por trimestre de cada cajero. */
    function categoriasPorTrimestre(lista) {
      return trimestresCompletos(lista).map(function (t) {
        return { trimestre: t, categorias: categorias(t.periodos, minMesesTrimestre) };
      });
    }

    // --------------------------------------------------- opciones en cascada

    /* §5 — cada filtro ofrece solo valores que siguen existiendo con los otros aplicados. */
    // ------------------------------------------- gestión zonal (D-27)

    /* Comparación entre jefes zonales. Tres reglas la sostienen:

       1. La vara es el GRUPO DE PARES del local (dim.plazas), que es exógeno: no
          se calcula con el volumen. Si el grupo saliera del resultado, un local
          flojo terminaría comparado contra otros flojos y el criterio absolvería
          justo lo que tiene que detectar.
       2. El denominador es el cajero-mes, nunca el local ni la zona: el volumen
          de una zona es sobre todo su dotación, no su gestión.
       3. La dotación NO entra en el grupo de pares. Poner más gente en un punto
          es una decisión del jefe zonal —y diluye el rendimiento por cajero—,
          así que tiene que verse en el resultado, no normalizarse. */

    const confGestion = config.gestion_zonal || {};
    const pesosGestion = confGestion.pesos || { rendimiento: 40, cobertura: 20, cola: 20, evolucion: 20 };
    const confCola = confGestion.cola_cronica || { percentil: 25, minimo_meses: 6 };
    const confEstabilidad = confGestion.estabilidad || { iteraciones: 400, semilla: 20260922, intervalo: 80 };
    const confBrecha = confGestion.brecha_plaza || { minimo_meses_local: 6, ratio_minimo: 1.4 };
    const plazaPorLocal = locales.plaza || null;
    const altasInferidas = !!(datos.meta && datos.meta.altas_inferidas);
    const memoGestion = new Map();
    /* La cola crónica se calcula y se expone, pero NO pondera en el índice:
       medido el 2026-09-23, 82 de 83 crónicos trabajaban en locales que ya
       estaban por debajo de la vara de su región, así que el pilar medía el
       local y no a la persona. Comparando a cada cajero contra sus compañeros
       del mismo local quedan 4 de 663. Ver D-27. */
    const CLAVES_PILAR = ['rendimiento', 'cobertura', 'evolucion'];

    function plazaDe(l) {
      return plazaPorLocal && l >= 0 ? plazaPorLocal[l] : 0;
    }

    /* Generador pseudoaleatorio determinista (mulberry32). El intervalo de
       confianza tiene que dar lo mismo cada vez que se abre y cada vez que se
       imprime la presentación: si no, dos personas discuten números distintos. */
    function generador(semilla) {
      let a = semilla >>> 0;
      return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function gestionZonal(lista) {
      const clave = lista.join(',');
      if (memoGestion.has(clave)) return memoGestion.get(clave);

      const enPeriodo = new Set(lista);
      // Ventanas móviles, no trimestres calendario: con datos hasta agosto los
      // trimestres completos descartarían julio y agosto, que son los dos meses
      // que más importan. Es la misma ventana que usa avancePorJefe, así que el
      // pilar de evolución y el ranking de avance hablan del mismo número.
      const ventana = ventanaComparacion(lista);
      const mesesInicio = new Set(ventana ? ventana.inicio : []);
      const mesesFin = new Set(ventana ? ventana.fin : []);
      const minMesesCola = confCola.minimo_meses;

      /* Con altas y bajas inferidas de la propia actividad (D-08, corregido en
         D-26), "habilitado" es casi lo mismo que "activo": la cobertura da 99 a
         100% para todas las zonas. Ordenar por esa diferencia es ordenar por
         ruido, así que el pilar se muestra pero no pondera. */
      const clavesPilar = CLAVES_PILAR.filter(function (k) {
        return !(k === 'cobertura' && altasInferidas);
      });

      // --- un registro por cajero-mes con operaciones, imputado al local donde
      //     más operó ese mes (mismo criterio que D-19).
      const cajeroMes = [];
      const porCajero = [];
      for (let c = 0; c < nCajeros; c++) {
        const filas = filasPorCajero[c];
        const meses = new Map();
        const opsPorLocal = new Map();
        for (let i = 0; i < filas.length; i++) {
          const f = filas[i];
          const p = tx.periodo[f];
          if (!enPeriodo.has(p)) continue;
          const cant = tx.cantidad[f];
          if (cant <= 0) continue;
          if (!meses.has(p)) meses.set(p, new Map());
          mapaIncrementar(meses.get(p), tx.local[f], cant);
          mapaIncrementar(opsPorLocal, tx.local[f], cant);
        }
        let principal = -1;
        let mejorOps = -1;
        opsPorLocal.forEach(function (v, l) {
          if (v > mejorOps) {
            mejorOps = v;
            principal = l;
          }
        });
        if (principal < 0) principal = cajeros.local_actual[c];
        const d = {
          cajero: c,
          local: principal,
          jefe: principal >= 0 ? locales.jefe[principal] : -1,
          ops: 0,
          esperado: 0,
          mesesActivos: 0,
          mesesHabilitado: mesesHabilitado(c, lista),
          mesesBajo: 0,
          opsInicio: 0,
          opsFin: 0,
          activoInicio: false,
          activoFin: false
        };
        meses.forEach(function (porLocal, p) {
          let ops = 0;
          let dominante = -1;
          let domOps = -1;
          porLocal.forEach(function (v, l) {
            ops += v;
            if (v > domOps) {
              domOps = v;
              dominante = l;
            }
          });
          d.ops += ops;
          d.mesesActivos++;
          if (mesesInicio.has(p)) {
            d.opsInicio += ops;
            d.activoInicio = true;
          }
          if (mesesFin.has(p)) {
            d.opsFin += ops;
            d.activoFin = true;
          }
          cajeroMes.push({ cajero: c, periodo: p, ops: ops, local: dominante, plaza: plazaDe(dominante) });
        });
        porCajero.push(d);
      }

      // --- la vara: mediana y percentil de corte de cada grupo de pares
      const opsPorPlaza = new Map();
      cajeroMes.forEach(function (r) {
        if (!opsPorPlaza.has(r.plaza)) opsPorPlaza.set(r.plaza, []);
        opsPorPlaza.get(r.plaza).push(r.ops);
      });
      const varas = new Map();
      opsPorPlaza.forEach(function (ops, plaza) {
        const ordenados = ops.slice().sort((a, b) => a - b);
        varas.set(plaza, {
          plaza: plaza,
          cajeroMes: ordenados.length,
          mediana: valorEnPercentil(ordenados, 50),
          corte: valorEnPercentil(ordenados, confCola.percentil)
        });
      });

      const porCajeroIdx = new Map(porCajero.map((d) => [d.cajero, d]));
      cajeroMes.forEach(function (r) {
        const vara = varas.get(r.plaza);
        if (!vara) return;
        const d = porCajeroIdx.get(r.cajero);
        d.esperado += vara.mediana;
        if (r.ops < vara.corte) d.mesesBajo++;
      });
      porCajero.forEach(function (d) {
        d.evaluable = d.mesesActivos >= minMesesCola;
        d.cronico = d.evaluable && d.mesesBajo >= minMesesCola;
        d.rendimiento = d.esperado > 0 ? d.ops / d.esperado : null;
      });

      // --- los cuatro pilares, calculados sobre un conjunto de cajeros
      function pilares(conjunto) {
        let ops = 0;
        let esperado = 0;
        let activos = 0;
        let habilitados = 0;
        let evaluables = 0;
        let cronicos = 0;
        let opsInicio = 0;
        let opsFin = 0;
        let operadoresInicio = 0;
        let operadoresFin = 0;
        for (let i = 0; i < conjunto.length; i++) {
          const d = conjunto[i];
          ops += d.ops;
          esperado += d.esperado;
          activos += d.mesesActivos;
          habilitados += d.mesesHabilitado;
          if (d.evaluable) {
            evaluables++;
            if (d.cronico) cronicos++;
          }
          // Operaciones por operador en cada ventana: el avance de la zona
          // contra sí misma, ya normalizado por dotación. Que un punto abra o
          // se mude no lo mueve, porque el denominador acompaña.
          if (d.activoInicio) {
            opsInicio += d.opsInicio;
            operadoresInicio++;
          }
          if (d.activoFin) {
            opsFin += d.opsFin;
            operadoresFin++;
          }
        }
        const porOperadorInicio = operadoresInicio > 0 ? opsInicio / operadoresInicio : 0;
        const porOperadorFin = operadoresFin > 0 ? opsFin / operadoresFin : 0;
        return {
          ops: ops,
          esperado: esperado,
          cajeros: conjunto.length,
          evaluables: evaluables,
          cronicos: cronicos,
          rendimiento: esperado > 0 ? ops / esperado : null,
          cobertura: habilitados > 0 ? (activos / habilitados) * 100 : null,
          cola: evaluables > 0 ? (cronicos / evaluables) * 100 : null,
          opsPorOperadorInicio: porOperadorInicio,
          opsPorOperadorFin: porOperadorFin,
          evolucion: porOperadorInicio > 0 ? (porOperadorFin / porOperadorInicio - 1) * 100 : null
        };
      }

      /* Índice: percentil de cada pilar entre los jefes comparados, ponderado.
         Un pilar que no se puede calcular para NADIE (por ejemplo la evolución
         cuando el recorte no llega a dos trimestres completos) sale del promedio
         en vez de valer cero. */
      function componer(filas) {
        const usables = [];
        clavesPilar.forEach(function (k) {
          const hayAlguno = filas.some((f) => f[k] !== null);
          if (!hayAlguno) {
            filas.forEach(function (f) {
              f['p_' + k] = null;
            });
            return;
          }
          usables.push(k);
          // la cola juega al revés: menos cola crónica es mejor gestión
          const valores = filas.map(function (f) {
            if (f[k] === null) return -Infinity;
            return k === 'cola' ? -f[k] : f[k];
          });
          const p = percentiles(valores);
          filas.forEach(function (f, i) {
            f['p_' + k] = f[k] === null ? null : p[i];
          });
        });
        filas.forEach(function (f) {
          let peso = 0;
          let acumulado = 0;
          usables.forEach(function (k) {
            if (f['p_' + k] === null) return;
            const w = pesosGestion[k] || 0;
            peso += w;
            acumulado += w * f['p_' + k];
          });
          f.indice = peso > 0 ? acumulado / peso : 0;
        });
        return usables;
      }

      // --- jefes presentes y su resultado real
      const cajerosPorJefe = new Map();
      porCajero.forEach(function (d) {
        if (d.jefe < 0) return;
        if (!cajerosPorJefe.has(d.jefe)) cajerosPorJefe.set(d.jefe, []);
        cajerosPorJefe.get(d.jefe).push(d);
      });
      const jefes = Array.from(cajerosPorJefe.keys()).sort((a, b) => a - b);
      const filas = jefes.map(function (j) {
        return Object.assign({ jefe: j }, pilares(cajerosPorJefe.get(j)));
      });
      const pilaresUsados = componer(filas);
      filas.sort((a, b) => b.indice - a.indice);

      const n = filas.length;
      function grupoEn(posicion) {
        if (n < 3) return 'en_linea';
        if (posicion <= n / 3) return 'adelante';
        if (posicion <= (2 * n) / 3) return 'en_linea';
        return 'atras';
      }
      filas.forEach(function (f, i) {
        f.posicion = i + 1;
        f.grupo = grupoEn(i + 1);
      });

      // --- estabilidad: remuestreo de cajeros dentro de cada zona.
      //     Con diez jefes y diferencias de pocos puntos, las posiciones del
      //     medio no se distinguen entre sí; el intervalo lo deja a la vista.
      const posiciones = new Map(jefes.map((j) => [j, []]));
      if (n > 1) {
        const azar = generador(confEstabilidad.semilla);
        const iteraciones = confEstabilidad.iteraciones;
        for (let it = 0; it < iteraciones; it++) {
          const muestra = jefes.map(function (j) {
            const base = cajerosPorJefe.get(j);
            const remuestra = new Array(base.length);
            for (let k = 0; k < base.length; k++) {
              remuestra[k] = base[Math.floor(azar() * base.length)];
            }
            return Object.assign({ jefe: j }, pilares(remuestra));
          });
          componer(muestra);
          muestra.sort((a, b) => b.indice - a.indice);
          muestra.forEach(function (f, i) {
            posiciones.get(f.jefe).push(i + 1);
          });
        }
      }
      const colaIC = (100 - confEstabilidad.intervalo) / 2;
      filas.forEach(function (f) {
        const p = posiciones.get(f.jefe).slice().sort((a, b) => a - b);
        if (!p.length) {
          f.estabilidad = null;
          return;
        }
        const tercio = Math.max(1, Math.round(n / 3));
        f.estabilidad = {
          media: suma(p) / p.length,
          desde: valorEnPercentil(p, colaIC),
          hasta: valorEnPercentil(p, 100 - colaIC),
          adelante: (p.filter((v) => v <= tercio).length / p.length) * 100,
          atras: (p.filter((v) => v > n - tercio).length / p.length) * 100,
          iteraciones: p.length
        };
      });

      // --- los cajeros crónicos, que son la lista con la que se trabaja
      const cronicos = porCajero
        .filter((d) => d.cronico)
        .map(function (d) {
          return {
            cajero: d.cajero,
            jefe: d.jefe,
            local: d.local,
            plaza: plazaDe(d.local),
            ops: d.ops,
            esperado: d.esperado,
            rendimiento: d.rendimiento,
            mesesActivos: d.mesesActivos,
            mesesBajo: d.mesesBajo,
            brecha: d.esperado - d.ops
          };
        })
        .sort((a, b) => b.brecha - a.brecha);

      // --- brecha dentro de la misma plaza: dos o más locales del mismo jefe en
      //     la misma localidad, con rendimientos distintos.
      const agregadoLocal = new Map();
      cajeroMes.forEach(function (r) {
        if (r.local < 0) return;
        let a = agregadoLocal.get(r.local);
        if (!a) {
          a = { local: r.local, ops: [], meses: new Set(), total: 0 };
          agregadoLocal.set(r.local, a);
        }
        a.ops.push(r.ops);
        a.meses.add(r.periodo);
        a.total += r.ops;
      });
      const porPlazaJefe = new Map();
      agregadoLocal.forEach(function (a) {
        if (a.meses.size < confBrecha.minimo_meses_local) return;
        const ordenados = a.ops.slice().sort((x, y) => x - y);
        const entrada = {
          local: a.local,
          jefe: locales.jefe[a.local],
          localidad: locales.localidad[a.local],
          rinde: valorEnPercentil(ordenados, 50),
          cajeroMes: a.ops.length,
          ops: a.total,
          meses: a.meses.size
        };
        const k = entrada.localidad + '|' + entrada.jefe;
        if (!porPlazaJefe.has(k)) porPlazaJefe.set(k, []);
        porPlazaJefe.get(k).push(entrada);
      });
      /* La otra mitad de la pregunta: dentro de un mismo local, ¿hay gente que
         rinde mucho menos que sus compañeros? Mismo mostrador, misma demanda,
         mismo horario, así que acá el local ya no explica nada. Es la vara
         correcta para hablar de personas, y la que muestra que la cola
         individual de esta red es casi inexistente. */
      const confCompaneros = confGestion.entre_companeros || { umbral: 0.6, minimo_companeros: 3 };
      const porLocalMes = new Map();
      cajeroMes.forEach(function (r) {
        const k = r.local + '|' + r.periodo;
        if (!porLocalMes.has(k)) porLocalMes.set(k, []);
        porLocalMes.get(k).push(r.ops);
      });
      const contraCompaneros = new Map();
      cajeroMes.forEach(function (r) {
        const companeros = porLocalMes.get(r.local + '|' + r.periodo);
        if (!companeros || companeros.length < confCompaneros.minimo_companeros) return;
        const mediana = valorEnPercentil(companeros.slice().sort((a, b) => a - b), 50);
        let acc = contraCompaneros.get(r.cajero);
        if (!acc) {
          acc = { cajero: r.cajero, local: r.local, meses: 0, bajo: 0, ops: 0, esperado: 0 };
          contraCompaneros.set(r.cajero, acc);
        }
        acc.meses++;
        acc.ops += r.ops;
        acc.esperado += mediana;
        acc.local = r.local;
        if (r.ops < confCompaneros.umbral * mediana) acc.bajo++;
      });
      const bajoSusCompaneros = [];
      let evaluablesEntrePares = 0;
      contraCompaneros.forEach(function (a) {
        if (a.meses < minMesesCola) return;
        evaluablesEntrePares++;
        if (a.bajo >= minMesesCola) {
          bajoSusCompaneros.push({
            cajero: a.cajero,
            local: a.local,
            jefe: locales.jefe[a.local],
            ops: a.ops,
            esperado: a.esperado,
            rendimiento: a.esperado > 0 ? a.ops / a.esperado : null,
            meses: a.meses,
            mesesBajo: a.bajo,
            brecha: Math.max(0, a.esperado - a.ops)
          });
        }
      });
      bajoSusCompaneros.sort((a, b) => b.brecha - a.brecha);

      /* Cada local contra la vara de su grupo de pares. Es la misma cuenta que
         la brecha intra-plaza pero sin exigir que haya otro local en la misma
         localidad, así que cubre a toda la red. */
      const localesContraPares = [];
      agregadoLocal.forEach(function (a) {
        if (a.meses.size < confBrecha.minimo_meses_local) return;
        const plaza = plazaDe(a.local);
        const vara = varas.get(plaza);
        if (!vara || !vara.mediana) return;
        const ordenados = a.ops.slice().sort((x, y) => x - y);
        const rinde = valorEnPercentil(ordenados, 50);
        localesContraPares.push({
          local: a.local,
          jefe: locales.jefe[a.local],
          localidad: locales.localidad[a.local],
          plaza: plaza,
          rinde: rinde,
          vara: vara.mediana,
          ratio: rinde / vara.mediana,
          cajeroMes: a.ops.length,
          ops: a.total,
          brecha: Math.max(0, (vara.mediana - rinde) * a.ops.length)
        });
      });
      localesContraPares.sort((a, b) => b.brecha - a.brecha);

      const brechas = [];
      porPlazaJefe.forEach(function (locs) {
        if (locs.length < 2) return;
        locs.sort((a, b) => b.rinde - a.rinde);
        const mejor = locs[0];
        const peor = locs[locs.length - 1];
        if (!peor.rinde || mejor.rinde / peor.rinde < confBrecha.ratio_minimo) return;
        brechas.push({
          localidad: mejor.localidad,
          jefe: mejor.jefe,
          locales: locs,
          mejor: mejor,
          peor: peor,
          ratio: mejor.rinde / peor.rinde,
          oportunidad: (mejor.rinde - peor.rinde) * peor.cajeroMes
        });
      });
      brechas.sort((a, b) => b.oportunidad - a.oportunidad);

      const resultado = {
        periodos: lista,
        ventana: ventana,
        jefes: filas,
        altasInferidas: altasInferidas,
        pilaresPonderados: pilaresUsados,
        varas: Array.from(varas.values()).sort((a, b) => a.plaza - b.plaza),
        cronicos: cronicos,
        locales: localesContraPares,
        bajoSusCompaneros: bajoSusCompaneros,
        evaluablesEntrePares: evaluablesEntrePares,
        umbralCompaneros: confCompaneros.umbral,
        brechas: brechas,
        pilares: pilaresUsados,
        pesos: pesosGestion,
        minimoMesesCola: minMesesCola,
        percentilCola: confCola.percentil,
        cajerosEvaluados: porCajero.filter((d) => d.evaluable).length,
        oportunidadCola: cronicos.reduce((acc, c) => acc + Math.max(0, c.brecha), 0),
        oportunidadBrechas: brechas.reduce((acc, b) => acc + b.oportunidad, 0),
        oportunidadLocales: localesContraPares.reduce((acc, l) => acc + l.brecha, 0),
        opsTotales: suma(filas.map((f) => f.ops))
      };
      memoGestion.set(clave, resultado);
      return resultado;
    }

    function opcionesFiltros(estado) {
      const lista = resolverPeriodo(estado.periodo);
      function sinFiltro(nombre) {
        const copia = Object.assign({}, estado);
        copia[nombre] = [];
        return localesDe(copia);
      }
      const porJefe = new Set();
      sinFiltro('jefes').forEach((l) => porJefe.add(locales.jefe[l]));
      const porZona = new Set();
      sinFiltro('tiposZona').forEach((l) => porZona.add(locales.tipo_zona[l]));
      const porLocalidad = new Set();
      sinFiltro('localidades').forEach((l) => porLocalidad.add(locales.localidad[l]));
      const porLocal = new Set(sinFiltro('locales'));

      const tiposDisponibles = new Set();
      filasDe(lista, Object.assign({}, estado, { tipos: [] })).forEach((f) => tiposDisponibles.add(tx.tipo[f]));

      const gruposDisponibles = new Set();
      if (tieneGrupo) {
        filasDe(lista, Object.assign({}, estado, { grupos: [] })).forEach((f) => gruposDisponibles.add(tx.grupo[f]));
      }

      return {
        jefes: Array.from(porJefe).sort((a, b) => a - b),
        tiposZona: Array.from(porZona).sort((a, b) => a - b),
        localidades: Array.from(porLocalidad).sort((a, b) => a - b),
        locales: Array.from(porLocal).sort((a, b) => a - b),
        grupos: Array.from(gruposDisponibles).sort((a, b) => a - b),
        tipos: Array.from(tiposDisponibles).sort((a, b) => a - b)
      };
    }

    return {
      datos: datos,
      config: config,
      periodos: periodos,
      tieneRechazos: tieneRechazos,
      tieneGrupo: tieneGrupo,
      contexto: contexto,
      categorias: categorias,
      categoriasPorTrimestre: categoriasPorTrimestre,
      comparativoAnual: comparativoAnual,
      mejora: mejora,
      gestionZonal: gestionZonal,
      opcionesFiltros: opcionesFiltros,
      resolverPeriodo: resolverPeriodo,
      periodosAnioAnterior: periodosAnioAnterior,
      trimestresCompletos: trimestresCompletos,
      ventanaComparacion: ventanaComparacion,
      habilitadoEn: habilitadoEn
    };
  }

  const API = {
    crearMotor: crearMotor,
    percentiles: percentiles,
    valorEnPercentil: valorEnPercentil,
    periodoANumero: periodoANumero,
    anioDe: anioDe,
    mesDe: mesDe,
    trimestreDe: trimestreDe,
    finDeMes: finDeMes,
    inicioDeMes: inicioDeMes
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.Metricas = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
