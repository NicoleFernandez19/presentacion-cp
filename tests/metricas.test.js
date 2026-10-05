/* Pruebas del motor de métricas. Correr con: node --test tests/
   Cubren los criterios de aceptación de Requerimiento.md §9 que no necesitan navegador. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const Metricas = require('../src/js/metricas.js');
const Formato = require('../src/js/formato.js');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

/* Dataset sintético reproducible: 2 jefes, 4 locales, 12 cajeros, 12 meses, 2 tipos.
   Incluye a propósito un cajero que nunca operó, uno con un solo mes activo y
   uno que opera en dos locales de zonas distintas. */
function fixture() {
  const periodos = [];
  for (let m = 1; m <= 12; m++) periodos.push(202500 + m);

  const locales = {
    id: ['L1', 'L2', 'L3', 'L4'],
    nombre: ['Local Uno', 'Local Dos', 'Local Tres', 'Local Cuatro'],
    localidad: [0, 0, 1, 1],
    provincia: [0, 0, 0, 0],
    jefe: [0, 0, 1, 1],
    tipo_zona: [0, 0, 1, 1],
    lat: [null, null, null, null],
    lon: [null, null, null, null],
    apertura: [0, 0, 0, 0],
    cierre: [0, 0, 0, 0]
  };

  const nCajeros = 12;
  const cajeros = { id: [], nombre: [], local_actual: [], alta: [], baja: [] };
  for (let c = 0; c < nCajeros; c++) {
    cajeros.id.push('C' + (c + 1));
    cajeros.nombre.push('Cajero ' + (c + 1));
    cajeros.local_actual.push(c % 4);
    cajeros.alta.push(20240101);
    cajeros.baja.push(0);
  }

  const tx = { periodo: [], cajero: [], local: [], grupo: [], tipo: [], cantidad: [], rechazadas: [] };
  let semilla = 7;
  const aleatorio = function () {
    semilla = (semilla * 1103515245 + 12345) % 2147483648;
    return semilla / 2147483648;
  };

  for (let c = 0; c < nCajeros; c++) {
    if (c === 11) continue; // nunca operó
    const mesesDelCajero = c === 10 ? [202503] : periodos; // uno con un solo mes activo
    mesesDelCajero.forEach(function (p) {
      for (let t = 0; t < 2; t++) {
        // el cajero 9 opera en dos locales, uno de cada tipo de zona
        const local = c === 9 && p % 2 === 0 ? 2 : c % 4;
        const cantidad = Math.round(50 + aleatorio() * 400 + c * 12);
        tx.periodo.push(p);
        tx.cajero.push(c);
        tx.local.push(local);
        // tipo 0 -> grupo 0 (SF2 sin TEC), tipo 1 -> grupo 2 (MT); el grupo 1 (TEC)
        // aparece solo en algunos meses, como en el dato real: es muy chico.
        tx.grupo.push(t === 0 ? 0 : 2);
        tx.tipo.push(t);
        tx.cantidad.push(cantidad);
        tx.rechazadas.push(Math.round(cantidad * 0.02));
        if (t === 0 && c % 3 === 0) {
          tx.periodo.push(p);
          tx.cajero.push(c);
          tx.local.push(local);
          tx.grupo.push(1);
          tx.tipo.push(0);
          tx.cantidad.push(3);
          tx.rechazadas.push(0);
        }
      }
    });
  }

  return {
    meta: {
      periodos: periodos,
      periodo_corte: 202512,
      anio_actual: 2025,
      anio_anterior: null,
      opcionales: { montos: true, rechazos: true },
      filas: {}
    },
    config: config,
    dim: {
      jefes: ['Jefa Norte', 'Jefe Sur'],
      localidades: ['Localidad A', 'Localidad B'],
      provincias: ['Provincia X'],
      tiposZona: ['Alto movimiento', 'Bajo movimiento'],
      grupos: ['SF2 sin TEC', 'TEC', 'MT'],
      tiposOperacion: ['SF2 Positivo', 'Negativos'],
      locales: locales,
      cajeros: cajeros
    },
    tx: tx,
    actividad: null,
    hitos: null,
    horaria: null,
    capacitaciones: null,
    textos: null
  };
}

const datos = fixture();
const motor = Metricas.crearMotor(datos, config);
const estadoBase = {
  periodo: { modo: 'anio', anio: 2025 },
  jefes: [],
  tiposZona: [],
  localidades: [],
  locales: [],
  grupos: [],
  tipos: []
};

function estado(extra) {
  return Object.assign({}, estadoBase, extra || {});
}

// --------------------------------------------------------------------- §9

test('la suma de operaciones por jefe zonal coincide con el total de la red', function () {
  const combinaciones = [
    estado(),
    estado({ tipos: [0] }),
    estado({ tipos: [1] }),
    estado({ periodo: { modo: 'trimestre', anio: 2025, trimestre: 2 } }),
    estado({ periodo: { modo: 'mes', desde: 202507 } }),
    estado({ periodo: { modo: 'rango', desde: 202503, hasta: 202509 }, tipos: [0] })
  ];
  combinaciones.forEach(function (e, i) {
    const ctx = motor.contexto(e);
    let suma = 0;
    ctx.porJefe().forEach(function (a) {
      suma += a.ops;
    });
    assert.strictEqual(suma, ctx.totales().ops, 'combinación ' + i);
  });
});

test('la suma por grupo cierra contra el total y el filtro de grupo recorta', function () {
  const ctx = motor.contexto(estado());
  let suma = 0;
  ctx.porGrupo().forEach((a) => (suma += a.ops));
  assert.strictEqual(suma, ctx.totales().ops);

  // Los tres grupos están presentes y cada uno recorta lo suyo.
  const porGrupo = new Map();
  ctx.porGrupo().forEach((a, g) => porGrupo.set(g, a.ops));
  assert.strictEqual(porGrupo.size, 3);
  let sumaFiltrada = 0;
  [0, 1, 2].forEach(function (g) {
    const filtrado = motor.contexto(estado({ grupos: [g] }));
    assert.strictEqual(filtrado.totales().ops, porGrupo.get(g), 'grupo ' + g);
    sumaFiltrada += filtrado.totales().ops;
  });
  assert.strictEqual(sumaFiltrada, ctx.totales().ops);
});

test('el filtro de grupo no cambia el IP ni la categoría de ningún cajero', function () {
  const referencia = motor.contexto(estado()).categorias;
  [0, 1, 2].forEach(function (g) {
    const cats = motor.contexto(estado({ grupos: [g] })).categorias;
    assert.deepStrictEqual(Array.from(cats.ip), Array.from(referencia.ip), 'grupo ' + g);
    assert.deepStrictEqual(cats.categoria, referencia.categoria, 'grupo ' + g);
  });
});

test('la dotación informa habilitados, con actividad y sin actividad', function () {
  const ctx = motor.contexto(estado());
  const d = ctx.dotacion();
  assert.ok(d.habilitadosPromedio > 0);
  assert.ok(Math.abs(d.habilitadosPromedio - d.activosPromedio - d.inactivosPromedio) < 1e-9);
  assert.ok(d.porcentajeInactivos >= 0 && d.porcentajeInactivos <= 100);
  // el cajero 11 nunca operó: la dotación lo cuenta como habilitado sin actividad
  assert.ok(d.inactivosPromedio >= 1);
  assert.strictEqual(d.cajerosDistintos, ctx.metricasCajeros().length);

  ctx.porMes().forEach(function (m) {
    assert.strictEqual(m.cajerosInactivos, Math.max(0, m.cajerosHabilitados - m.cajerosConActividad));
    assert.ok(m.cajerosConActividad <= m.cajerosHabilitados);
  });
});

test('la inactividad no depende del recorte: un cajero que operó en otra zona no cuenta como inactivo', function () {
  const red = motor.contexto(estado()).porMes();
  // el cajero 9 opera en dos locales de jefes distintos; con un jefe filtrado
  // sigue estando "con actividad" porque operó en algún lado
  const zona = motor.contexto(estado({ jefes: [0] })).porMes();
  zona.forEach(function (m, i) {
    assert.ok(m.porcentajeInactivos <= Math.max(5, red[i].porcentajeInactivos + 5),
      'la inactividad de la zona se disparó contra la de la red en ' + m.periodo);
  });
});

test('la suma por tipo de operación y por local también cierra contra el total', function () {
  const ctx = motor.contexto(estado());
  let porTipo = 0;
  ctx.porTipo().forEach((a) => (porTipo += a.ops));
  let porLocal = 0;
  ctx.porLocal().forEach((a) => (porLocal += a.ops));
  assert.strictEqual(porTipo, ctx.totales().ops);
  assert.strictEqual(porLocal, ctx.totales().ops);
});

test('los cajeros por categoría suman el total de cajeros con datos suficientes', function () {
  const ctx = motor.contexto(estado());
  const conteo = ctx.conteoCategorias();
  const metricas = ctx.metricasCajeros();
  const suficientes = metricas.filter((m) => m.suficiente).length;
  assert.strictEqual(conteo.alta + conteo.media + conteo.baja, suficientes);
  assert.strictEqual(
    conteo.alta + conteo.media + conteo.baja + conteo.sin_datos,
    metricas.length
  );
});

test('los filtros no cambian la categoría de ningún cajero', function () {
  const referencia = new Map();
  motor.contexto(estado()).metricasCajeros().forEach(function (m) {
    referencia.set(m.cajero, m.categoria);
  });

  const variantes = [
    estado({ jefes: [0] }),
    estado({ jefes: [1] }),
    estado({ localidades: [0] }),
    estado({ locales: [2] }),
    estado({ tipos: [0] }),
    estado({ tiposZona: [1] }),
    estado({ jefes: [0], tipos: [1], localidades: [0] })
  ];
  variantes.forEach(function (e, i) {
    motor.contexto(e).metricasCajeros().forEach(function (m) {
      assert.strictEqual(m.categoria, referencia.get(m.cajero), 'variante ' + i + ' cajero ' + m.id);
      assert.strictEqual(m.ip, motor.contexto(estado()).categorias.ip[m.cajero]);
    });
  });
});

test('el período sí cambia las categorías: son del período seleccionado', function () {
  const anual = motor.contexto(estado()).categorias;
  const trimestral = motor.contexto(estado({ periodo: { modo: 'trimestre', anio: 2025, trimestre: 1 } })).categorias;
  assert.notDeepStrictEqual(Array.from(anual.ip), Array.from(trimestral.ip));
});

// ------------------------------------------------------------ definiciones

test('el IP es operaciones sobre meses activos (D-02)', function () {
  const ctx = motor.contexto(estado());
  const cats = ctx.categorias;
  for (let c = 0; c < datos.dim.cajeros.id.length; c++) {
    if (cats.mesesActivos[c] === 0) {
      assert.strictEqual(cats.ip[c], 0);
      continue;
    }
    assert.ok(Math.abs(cats.ip[c] - cats.ops[c] / cats.mesesActivos[c]) < 1e-9, 'cajero ' + c);
  }
});

test('un cajero por debajo del mínimo de meses activos queda sin categoría', function () {
  const cats = motor.contexto(estado()).categorias;
  // el cajero 10 opera un solo mes; el mínimo por defecto es 3
  assert.strictEqual(cats.mesesActivos[10], 1);
  assert.strictEqual(cats.suficiente[10], 0);
  assert.strictEqual(cats.categoria[10], 'sin_datos');
  assert.ok(Number.isNaN(cats.percentil[10]));
});

test('un cajero que nunca operó no tiene meses activos ni categoría', function () {
  const cats = motor.contexto(estado()).categorias;
  assert.strictEqual(cats.mesesActivos[11], 0);
  assert.strictEqual(cats.ops[11], 0);
  assert.strictEqual(cats.categoria[11], 'sin_datos');
});

test('el tipo de zona del cajero es el del local donde más operó (D-19)', function () {
  const cats = motor.contexto(estado()).categorias;
  // el cajero 9 reparte entre el local 1 (zona 0) y el local 2 (zona 1)
  const ops = { 0: 0, 1: 0 };
  for (let f = 0; f < datos.tx.periodo.length; f++) {
    if (datos.tx.cajero[f] !== 9) continue;
    ops[datos.dim.locales.tipo_zona[datos.tx.local[f]]] += datos.tx.cantidad[f];
  }
  const dominante = ops[0] >= ops[1] ? 0 : 1;
  assert.strictEqual(cats.zona[9], dominante);
});

test('las categorías se comparan dentro del mismo tipo de zona', function () {
  const cats = motor.contexto(estado()).categorias;
  [0, 1].forEach(function (zona) {
    const ips = [];
    for (let c = 0; c < cats.ip.length; c++) {
      if (cats.suficiente[c] && cats.zona[c] === zona) ips.push({ ip: cats.ip[c], cat: cats.categoria[c] });
    }
    if (ips.length < 3) return;
    const altos = ips.filter((x) => x.cat === 'alta');
    const bajos = ips.filter((x) => x.cat === 'baja');
    if (altos.length && bajos.length) {
      const minAlta = Math.min.apply(null, altos.map((x) => x.ip));
      const maxBaja = Math.max.apply(null, bajos.map((x) => x.ip));
      assert.ok(minAlta > maxBaja, 'en zona ' + zona + ' un Alta quedó por debajo de un Baja');
    }
  });
});

test('los umbrales publicados coinciden con los cortes de categoría', function () {
  const cats = motor.contexto(estado()).categorias;
  [0, 1].forEach(function (zona) {
    const u = cats.umbrales[zona];
    if (!u || !u.cajeros) return;
    assert.ok(u.corteBajo <= u.corteAlto);
    for (let c = 0; c < cats.ip.length; c++) {
      if (!cats.suficiente[c] || cats.zona[c] !== zona) continue;
      if (cats.categoria[c] === 'alta') assert.ok(cats.ip[c] >= u.corteBajo);
      if (cats.categoria[c] === 'baja') assert.ok(cats.ip[c] <= u.corteAlto);
    }
  });
});

test('la concentración informa el porcentaje del 20% con más operaciones', function () {
  const conc = motor.contexto(estado()).concentracion();
  assert.strictEqual(conc.porcentajeCajeros, config.concentracion.porcentaje_cajeros);
  assert.ok(conc.porcentajeOps > 0 && conc.porcentajeOps <= 100);
  assert.ok(conc.porcentajeOps >= conc.porcentajeCajeros, 'el top debería concentrar al menos su proporción');
  const ultima = conc.curva[conc.curva.length - 1];
  assert.ok(Math.abs(ultima.porcentajeOps - 100) < 1e-6);
});

test('la mejora usa el primer y el último trimestre completo', function () {
  const resultado = motor.mejora(motor.resolverPeriodo({ modo: 'anio', anio: 2025 }));
  assert.ok(resultado.disponible);
  assert.strictEqual(resultado.trimestres.length, 4);
  assert.strictEqual(resultado.primero.trimestre, 1);
  assert.strictEqual(resultado.ultimo.trimestre, 4);
  resultado.cajeros.forEach(function (c) {
    assert.ok(Math.abs(c.mejora - (c.percentilFinal - c.percentilInicial)) < 1e-9);
    assert.ok(c.percentilInicial >= 0 && c.percentilInicial <= 100);
  });
  // el cajero con un solo mes activo no llega al mínimo en ningún trimestre
  assert.ok(!resultado.cajeros.some((c) => c.cajero === 10));
});

test('los períodos parciales no arman trimestre', function () {
  const parcial = motor.trimestresCompletos([202501, 202502, 202504, 202505, 202506]);
  assert.strictEqual(parcial.length, 1);
  assert.strictEqual(parcial[0].trimestre, 2);
});

test('las opciones de filtro son en cascada', function () {
  const opciones = motor.opcionesFiltros(estado({ jefes: [0] }));
  // con la jefa del norte elegida, solo quedan sus localidades y sus locales
  assert.deepStrictEqual(opciones.localidades, [0]);
  assert.deepStrictEqual(opciones.locales, [0, 1]);
  // y el propio filtro de jefe sigue ofreciendo a los dos, para poder cambiar
  assert.deepStrictEqual(opciones.jefes, [0, 1]);
});

test('el contexto vacío se detecta en vez de devolver ceros silenciosos', function () {
  const ctx = motor.contexto(estado({ jefes: [0], localidades: [1] }));
  assert.ok(ctx.vacio);
  assert.strictEqual(ctx.totales().ops, 0);
});

test('las métricas por local exponen IP promedio y porcentaje de inactivos', function () {
  const filas = motor.contexto(estado()).metricasLocales();
  assert.strictEqual(filas.length, 4);
  filas.forEach(function (f) {
    assert.ok(f.porcentajeInactivos >= 0 && f.porcentajeInactivos <= 100);
    if (f.cajerosConDatos > 0) assert.ok(f.ipPromedio > 0);
  });
  const total = filas.reduce((acc, f) => acc + f.ops, 0);
  assert.strictEqual(total, motor.contexto(estado()).totales().ops);
});

// -------------------------------------------------------------- percentiles

test('los percentiles reparten de 0 a 100 y empatan a los iguales', function () {
  const p = Metricas.percentiles([10, 20, 30, 40, 50]);
  assert.deepStrictEqual(p, [0, 25, 50, 75, 100]);
  const empates = Metricas.percentiles([5, 5, 5, 5]);
  assert.deepStrictEqual(empates, [50, 50, 50, 50]);
  assert.deepStrictEqual(Metricas.percentiles([]), []);
  assert.deepStrictEqual(Metricas.percentiles([7]), [50]);
});

test('el valor en un percentil interpola', function () {
  assert.strictEqual(Metricas.valorEnPercentil([0, 10], 50), 5);
  assert.strictEqual(Metricas.valorEnPercentil([0, 10, 20], 100), 20);
  assert.strictEqual(Metricas.valorEnPercentil([], 50), null);
});

test('los helpers de período resuelven año, mes y trimestre', function () {
  assert.strictEqual(Metricas.anioDe(202608), 2026);
  assert.strictEqual(Metricas.mesDe(202608), 8);
  assert.strictEqual(Metricas.trimestreDe(202608), 3);
  assert.strictEqual(Metricas.finDeMes(202602), 20260228);
  assert.strictEqual(Metricas.finDeMes(202402), 20240229);
  assert.strictEqual(Metricas.inicioDeMes(202608), 20260801);
});

// ------------------------------------------------- gestión zonal (D-27)

const periodos2025 = datos.meta.periodos.slice();

function fixtureConPlazas() {
  const d = fixture();
  // locales 0 y 1 en un grupo de pares, 2 y 3 en otro
  d.dim.locales.plaza = [0, 0, 1, 1];
  d.dim.plazas = ['Pares A', 'Pares B'];
  return d;
}

/* Operaciones por cajero-mes imputadas al local donde más operó ese mes: es el
   mismo criterio que usa el motor, recalculado acá a mano para contrastar. */
function cajeroMesDe(d, periodos) {
  const enPeriodo = new Set(periodos);
  const porClave = new Map();
  for (let i = 0; i < d.tx.periodo.length; i++) {
    if (!enPeriodo.has(d.tx.periodo[i]) || d.tx.cantidad[i] <= 0) continue;
    const clave = d.tx.cajero[i] + '|' + d.tx.periodo[i];
    if (!porClave.has(clave)) porClave.set(clave, { total: 0, porLocal: new Map() });
    const acc = porClave.get(clave);
    acc.total += d.tx.cantidad[i];
    acc.porLocal.set(d.tx.local[i], (acc.porLocal.get(d.tx.local[i]) || 0) + d.tx.cantidad[i]);
  }
  const salida = [];
  porClave.forEach(function (acc, clave) {
    let dominante = -1;
    let mejor = -1;
    acc.porLocal.forEach(function (v, l) {
      if (v > mejor) {
        mejor = v;
        dominante = l;
      }
    });
    salida.push({ cajero: Number(clave.split('|')[0]), ops: acc.total, local: dominante });
  });
  return salida;
}

test('el índice de gestión da una fila por jefe, ordenada, con posiciones consecutivas', function () {
  const g = motor.gestionZonal(periodos2025);
  assert.strictEqual(g.jefes.length, datos.dim.jefes.length);
  g.jefes.forEach(function (f, i) {
    assert.strictEqual(f.posicion, i + 1);
    assert.ok(f.indice >= 0 && f.indice <= 100, 'el índice queda entre 0 y 100');
    if (i > 0) assert.ok(g.jefes[i - 1].indice >= f.indice, 'las filas vienen ordenadas por índice');
  });
});

test('el índice de gestión depende del período y no de los filtros de la barra', function () {
  // Es el mismo invariante que las categorías (§4.6): se calcula sobre la lista
  // de períodos, así que dos recortes distintos del mismo año dan lo mismo.
  const conFiltro = motor.contexto(estado({ jefes: [0] }));
  const sinFiltro = motor.contexto(estado());
  const a = motor.gestionZonal(conFiltro.periodos);
  const b = motor.gestionZonal(sinFiltro.periodos);
  assert.deepStrictEqual(
    a.jefes.map((f) => [f.jefe, f.posicion, Math.round(f.indice * 1000)]),
    b.jefes.map((f) => [f.jefe, f.posicion, Math.round(f.indice * 1000)])
  );
});

test('la banda de confianza es determinista: dos motores dan exactamente lo mismo', function () {
  // Si el remuestreo no tuviera semilla fija, la presentación mostraría una
  // banda distinta en pantalla y otra impresa.
  const otro = Metricas.crearMotor(fixture(), config);
  const a = motor.gestionZonal(periodos2025);
  const b = otro.gestionZonal(periodos2025);
  assert.deepStrictEqual(
    a.jefes.map((f) => [f.jefe, f.estabilidad.desde, f.estabilidad.hasta, Math.round(f.estabilidad.media * 1e6)]),
    b.jefes.map((f) => [f.jefe, f.estabilidad.desde, f.estabilidad.hasta, Math.round(f.estabilidad.media * 1e6)])
  );
});

test('las operaciones de un cajero van al jefe del local donde más operó, y la suma cierra', function () {
  const g = motor.gestionZonal(periodos2025);
  const registros = cajeroMesDe(datos, periodos2025);
  const esperadoPorJefe = new Map();
  const opsPorCajero = new Map();
  const localDominante = new Map();
  registros.forEach(function (r) {
    opsPorCajero.set(r.cajero, (opsPorCajero.get(r.cajero) || 0) + r.ops);
    const acumulado = localDominante.get(r.cajero) || new Map();
    acumulado.set(r.local, (acumulado.get(r.local) || 0) + r.ops);
    localDominante.set(r.cajero, acumulado);
  });
  opsPorCajero.forEach(function (ops, c) {
    let mejorLocal = -1;
    let mejor = -1;
    localDominante.get(c).forEach(function (v, l) {
      if (v > mejor) {
        mejor = v;
        mejorLocal = l;
      }
    });
    const jefe = datos.dim.locales.jefe[mejorLocal];
    esperadoPorJefe.set(jefe, (esperadoPorJefe.get(jefe) || 0) + ops);
  });
  g.jefes.forEach(function (f) {
    assert.strictEqual(f.ops, esperadoPorJefe.get(f.jefe), 'ops del jefe ' + f.jefe);
  });
  const total = g.jefes.reduce((acc, f) => acc + f.ops, 0);
  assert.strictEqual(total, Array.from(opsPorCajero.values()).reduce((a, b) => a + b, 0));
});

test('la vara es la mediana del grupo de pares del local, no la de la red', function () {
  const d = fixtureConPlazas();
  const m = Metricas.crearMotor(d, config);
  const g = m.gestionZonal(periodos2025);
  assert.strictEqual(g.varas.length, 2, 'una vara por grupo de pares');

  const registros = cajeroMesDe(d, periodos2025);
  [0, 1].forEach(function (plaza) {
    const ops = registros
      .filter((r) => d.dim.locales.plaza[r.local] === plaza)
      .map((r) => r.ops)
      .sort((a, b) => a - b);
    const vara = g.varas.find((v) => v.plaza === plaza);
    assert.strictEqual(vara.cajeroMes, ops.length);
    assert.strictEqual(vara.mediana, Metricas.valorEnPercentil(ops, 50));
  });

  // y con dos varas distintas, el esperado de la red cambia contra una sola
  const g1 = motor.gestionZonal(periodos2025);
  const esperado2 = g.jefes.reduce((acc, f) => acc + f.esperado, 0);
  const esperado1 = g1.jefes.reduce((acc, f) => acc + f.esperado, 0);
  assert.notStrictEqual(Math.round(esperado1), Math.round(esperado2));
});

test('un cajero crónico estuvo bajo la vara el mínimo de meses exigido', function () {
  const g = motor.gestionZonal(periodos2025);
  const minimo = config.gestion_zonal.cola_cronica.minimo_meses;
  g.cronicos.forEach(function (c) {
    assert.ok(c.mesesBajo >= minimo, 'meses bajo la vara');
    assert.ok(c.mesesActivos >= minimo, 'meses activos');
    assert.ok(c.mesesBajo <= c.mesesActivos);
  });
  const evaluables = g.jefes.reduce((acc, f) => acc + f.evaluables, 0);
  assert.strictEqual(evaluables, g.cajerosEvaluados);
  const cronicos = g.jefes.reduce((acc, f) => acc + f.cronicos, 0);
  assert.strictEqual(cronicos, g.cronicos.length);
});

test('con altas inferidas, la cobertura se muestra pero no pondera', function () {
  const d = fixture();
  d.meta.altas_inferidas = true;
  const g = Metricas.crearMotor(d, config).gestionZonal(periodos2025);
  assert.ok(g.altasInferidas);
  assert.ok(!g.pilaresPonderados.includes('cobertura'), 'la cobertura queda fuera del promedio');
  assert.ok(g.pilaresPonderados.includes('rendimiento'));
  g.jefes.forEach((f) => assert.ok(f.cobertura !== null, 'igual se calcula para mostrarla'));

  const conCobertura = motor.gestionZonal(periodos2025);
  assert.ok(conCobertura.pilaresPonderados.includes('cobertura'));
});

test('un local con pocos meses de actividad no entra en la brecha de plaza', function () {
  // Dos locales de la misma localidad y del mismo jefe, uno con un rendimiento
  // muy por debajo pero recién abierto: es una apertura, no un local flojo.
  const d = fixture();
  const minimo = config.gestion_zonal.brecha_plaza.minimo_meses_local;
  d.dim.locales.localidad = [0, 0, 1, 1];
  const conTodos = Metricas.crearMotor(d, config).gestionZonal(periodos2025);
  const antes = conTodos.brechas.length;

  // ahora el local 1 arranca tarde: se le borran todos los meses menos los dos últimos
  const recortado = fixture();
  recortado.dim.locales.localidad = [0, 0, 1, 1];
  const ultimos = new Set(periodos2025.slice(-(minimo - 1)));
  const tx = recortado.tx;
  const filtrado = { periodo: [], cajero: [], local: [], grupo: [], tipo: [], cantidad: [], rechazadas: [] };
  for (let i = 0; i < tx.periodo.length; i++) {
    if (tx.local[i] === 1 && !ultimos.has(tx.periodo[i])) continue;
    Object.keys(filtrado).forEach((k) => filtrado[k].push(tx[k][i]));
  }
  recortado.tx = filtrado;
  const despues = Metricas.crearMotor(recortado, config).gestionZonal(periodos2025);
  assert.ok(
    despues.brechas.every((b) => b.locales.every((l) => l.local !== 1)),
    'el local que no llega al mínimo de meses queda afuera de la comparación'
  );
  assert.ok(antes >= despues.brechas.length);
});

test('la cola crónica se calcula pero ya no pondera en el índice (D-27)', function () {
  // Medía el local y no a la persona: 82 de 83 crónicos estaban en locales que
  // ya rendían por debajo de la vara de su región.
  const g = motor.gestionZonal(periodos2025);
  assert.ok(!g.pilaresPonderados.includes('cola'), 'la cola no entra en el promedio');
  assert.ok(Array.isArray(g.cronicos), 'pero se sigue calculando');
  g.jefes.forEach((f) => assert.ok(f.cola !== null, 'y sigue disponible por jefe'));
});

test('cada local se compara contra la vara de su grupo de pares', function () {
  const g = motor.gestionZonal(periodos2025);
  assert.ok(g.locales.length > 0);
  const varas = new Map(g.varas.map((v) => [v.plaza, v.mediana]));
  g.locales.forEach(function (l) {
    assert.strictEqual(l.vara, varas.get(l.plaza), 'la vara es la de su grupo de pares');
    assert.ok(Math.abs(l.ratio - l.rinde / l.vara) < 1e-9, 'el ratio es rinde sobre vara');
    assert.ok(l.brecha >= 0, 'la brecha nunca es negativa');
    if (l.ratio >= 1) assert.strictEqual(l.brecha, 0, 'un local sobre su vara no tiene brecha');
    else assert.ok(Math.abs(l.brecha - (l.vara - l.rinde) * l.cajeroMes) < 1e-6);
  });
  const suma = g.locales.reduce((acc, l) => acc + l.brecha, 0);
  assert.ok(Math.abs(suma - g.oportunidadLocales) < 1e-6, 'la oportunidad es la suma de las brechas');
});

test('a los cajeros se los compara contra sus compañeros del mismo local y mes', function () {
  const g = motor.gestionZonal(periodos2025);
  const min = config.gestion_zonal.cola_cronica.minimo_meses;
  const minCompaneros = config.gestion_zonal.entre_companeros.minimo_companeros;
  assert.ok(g.evaluablesEntrePares > 0, 'hay cajeros evaluables');
  g.bajoSusCompaneros.forEach(function (c) {
    assert.ok(c.mesesBajo >= min, 'estuvo bajo la vara el mínimo de meses');
    assert.ok(c.meses >= min);
    assert.ok(c.mesesBajo <= c.meses);
    assert.ok(c.brecha >= 0);
  });

  assert.ok(
    g.bajoSusCompaneros.length <= g.evaluablesEntrePares,
    'los señalados son un subconjunto de los evaluables'
  );
  g.bajoSusCompaneros.forEach(function (c) {
    assert.ok(c.esperado > c.ops, 'si está señalado, sus compañeros hicieron más que él');
    assert.ok(c.rendimiento < 1);
  });
});

test('las métricas por local informan los meses con actividad, para dejar afuera las aperturas', function () {
  const ctx = motor.contexto(estado());
  const porLocal = ctx.metricasLocales();
  const enPeriodo = new Set(ctx.periodos);
  porLocal.forEach(function (l) {
    const meses = new Set();
    for (let i = 0; i < datos.tx.periodo.length; i++) {
      if (datos.tx.local[i] !== l.local) continue;
      if (!enPeriodo.has(datos.tx.periodo[i]) || datos.tx.cantidad[i] <= 0) continue;
      meses.add(datos.tx.periodo[i]);
    }
    assert.strictEqual(l.mesesActivos, meses.size, 'meses del local ' + l.nombre);
    assert.ok(l.mesesActivos <= ctx.periodos.length);
  });
  assert.ok(porLocal.some((l) => l.mesesActivos > 0), 'algún local operó');
});

// ------------------------------------------------------------------ formato

test('los números y fechas salen en formato argentino', function () {
  assert.strictEqual(Formato.entero(1234567), '1.234.567');
  assert.strictEqual(Formato.decimal(1234.56, 2), '1.234,56');
  assert.strictEqual(Formato.porcentaje(34.2), '34,2%');
  assert.strictEqual(Formato.variacion(12.5), '+12,5%');
  assert.strictEqual(Formato.variacion(-3), '-3,0%');
  assert.strictEqual(Formato.fecha(20260831), '31/08/2026');
  assert.strictEqual(Formato.mes(202608), 'agosto 2026');
  assert.strictEqual(Formato.mesCorto(202601), 'ene 26');
  assert.strictEqual(Formato.entero(null), '—');
  assert.strictEqual(Formato.compacto(1234567), '1,2 M');
});
