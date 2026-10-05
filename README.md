# Presentación anual de la red — Canal Propio

Presentación interactiva en **un único archivo HTML** para que el jefe de jefes
zonales muestre a los jefes zonales la evolución de la red durante el año:
volumen de transacciones, actividad y productividad de los cajeros, distribución
por zona y rankings.

El archivo generado **abre con doble clic, sin servidor y sin internet**: los
datos, los estilos, los scripts y la librería de gráficos van embebidos.

- **Qué tiene que hacer y cómo se define cada métrica:** `Requerimiento.md`
- **Qué se decidió y por qué, incluidos los supuestos:** `DECISIONES.md`

---

## Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Python 3 | 3.11 o más | script de preparación |
| pandas + openpyxl | cualquiera reciente | lectura de CSV/XLSX |
| Node.js | 18 o más | pruebas del motor de métricas (opcional) |
| Chrome o Edge | actual | abrir la presentación |

```bash
pip install pandas openpyxl
```

La librería de gráficos (Apache ECharts 5.6) ya está en `vendor/echarts.min.js`.
No hace falta descargar nada más, y la presentación no consulta ninguna URL.

---

## Cómo se genera

### Con el conjunto de datos de ejemplo

Datos ficticios con la misma estructura de entrada — sirve para probar y para
demostrar la herramienta sin exponer datos reales:

```bash
python scripts/preparar_datos.py --ejemplo
```

### Con datos reales, directo de la base

```bash
python scripts/extraer_datos.py --solo-probar   # prueba la conexión
python scripts/extraer_datos.py                 # trae los datos a data/entrada/
python scripts/preparar_datos.py                # arma dist/presentacion.html
```

`extraer_datos.py` se conecta a SQL Server (`WUTeller`) con las dos queries de
`scripts/sql/` y arma las tablas de entrada por su cuenta. No necesita que el
Dashboard Canal Propio esté instalado. Opciones útiles: `--desde 20250100` para
cambiar el piso de fechas, `--conexion ruta.ini` para otra conexión.

**Conexión:** copiá `conexion.ejemplo.ini` a `conexion.ini` y completá los datos.
Si ese archivo no existe, el script usa el `config.ini` del Dashboard Canal
Propio. `conexion.ini` está excluido del control de versiones.

**Lo único que no sale de la base** es la asignación de locales a jefes zonales:
vive en `data/maestros/zonales.csv` y se mantiene a mano.

### Con datos reales, desde la carpeta del dashboard

Camino de respaldo para cuando hay acceso a la carpeta pero no a la base:

```bash
python scripts/importar_canal_propio.py
python scripts/preparar_datos.py
```

Toma `consolidado_transacciones.csv` (SF2, separando TEC por paycode) y
`consolidado_wupos.csv` (MT). Si el proyecto está en otra ruta:
`--origen "D:\ruta\Dashboard Canal Propio"`.

### Una versión por jefe zonal

El archivo completo trae datos nominales de cajeros de toda la red. Para
repartir, conviene un archivo por zona con solo sus datos:

```bash
python scripts/preparar_datos.py --por-jefe-zonal
```

Deja `dist/presentacion.html` más un `dist/presentacion-<jefe-zonal>.html` por
cada zona.

### Qué queda generado

| Archivo | Qué es |
|---|---|
| `dist/presentacion.html` | La presentación completa, lista para abrir o mandar |
| `dist/presentacion-<zona>.html` | Con `--por-jefe-zonal`: una por zona |
| `dist/validacion.txt` | Reporte de validación de los datos de entrada |

**Siempre leé `dist/validacion.txt`** antes de repartir el archivo: ahí salen los
IDs sin correspondencia, las filas duplicadas, los meses faltantes, los tipos de
operación desconocidos, los valores negativos y los días activos imposibles.

---

## Formato de los datos de entrada

CSV con separador `;` en UTF-8, o XLSX. Una tabla por archivo, con el nombre de
la tabla como nombre de archivo (`transacciones_mensuales.csv`, etc.). Las fechas
van en `dd/mm/aaaa`.

**Obligatorias**

| Tabla | Columnas |
|---|---|
| `transacciones_mensuales` | `anio; mes; id_cajero; id_local; grupo; tipo_operacion; cantidad` · opcional: `cantidad_rechazadas` |
| `cajeros` | `id_cajero; nombre_cajero; id_local_actual; fecha_alta` · opcional: `fecha_baja` |
| `locales` | `id_local; nombre_local; localidad; provincia; jefe_zonal` · opcionales: `region`, `tipo_zona`, `fecha_apertura`, `fecha_cierre`, `latitud`, `longitud` |

**Opcionales** — cada una habilita láminas que, si falta, simplemente no
aparecen:

| Tabla | Columnas | Habilita |
|---|---|---|
| `actividad_mensual` | `anio; mes; id_cajero; dias_activos` | columna informativa de días activos |
| `hitos` | `fecha; titulo; descripcion; jefe_zonal` | marcadores en la línea temporal |
| `actividad_horaria` | `anio; mes; id_local; dia_semana; hora; cantidad` | lámina de día y franja horaria |
| `capacitaciones` | `id_cajero; fecha; nombre_capacitacion` | lámina de capacitaciones |
| `textos_cierre` | `jefe_zonal; hallazgos; objetivos` | láminas de cierre |
| `localidades` | `id_local; localidad` | reemplaza la localidad derivada del nombre |
| `plazas` | `id_local; plaza` | reemplaza el grupo de pares con el que se compara a los jefes zonales (D-27) |

El año anterior no es un archivo aparte: van las mismas tablas con el `anio`
anterior adentro, y con eso se habilitan las comparaciones interanuales.

La columna **`grupo`** toma uno de tres valores —`SF2 sin TEC`, `TEC` o `MT`— y
cada uno trae sus propios `tipo_operacion` (D-01). Si el dato no la trae, todo
cae en un único grupo y el filtro no se muestra.

> **Dos cosas que no coinciden con el requerimiento original.**
> 1. El índice de productividad es operaciones por **mes activo**, no por día
>    activo: los datos reales no tienen granularidad diaria para todos los tipos
>    de operación (D-02).
> 2. **No hay importes.** La presentación habla solo de cantidad de
>    transacciones, así que la lámina de montos no existe (D-24).

---

## Parámetros

Todos los umbrales viven en `config.json`; no hay ninguno escrito en el código.

| Parámetro | Por defecto |
|---|---|
| Mínimo de meses activos para categoría y ranking | 3 (2 por trimestre) |
| Cortes de categorías | percentiles 33 y 67 dentro del tipo de zona |
| Localidades de alto movimiento (si se calcula) | 30% con más operaciones |
| Tamaño de los rankings | 20 y 20 cajeros · 10 de mejora · 10 y 10 locales |
| Porcentaje para concentración | 20% de cajeros |
| Pesos del índice de gestión zonal (D-27) | 40% rendimiento · 20% cobertura · 20% cola · 20% avance |
| Grupo de pares para comparar jefes zonales | `region`, con mínimo de 200 cajero-mes por grupo |
| Cola crónica | bajo el percentil 25 de sus pares durante 6 meses o más |
| Banda de confianza del ranking | 400 remuestreos, intervalo del 80%, semilla fija |
| Brecha dentro de una plaza | locales con 6 meses o más, umbral 1,4x |

El **grupo de pares** es la vara con la que se compara a los jefes zonales y es
lo único que no se puede definir con el volumen (ver D-27). Sale, en este orden,
de `plazas.csv`, de la columna `region` de `locales.csv`, de la provincia o de
toda la red. Si negocio tiene una categorización de plaza, entra por
`plazas.csv` sin tocar código: el bloque 8 de `dist/validacion.txt` muestra con
qué base quedó cada grupo.

También están ahí los textos de portada, las etiquetas visibles de los tipos de
operación y la paleta. **La paleta está validada** para fondo oscuro y daltonismo
(ver D-21): si se cambia un color, hay que volver a correr el validador.

---

## Cómo se usa la presentación

- **Teclado:** flechas y Av Pág / Re Pág para avanzar, Inicio y Fin para ir a los
  extremos, `F` para pantalla completa, `Esc` para cerrar el panel de detalle.
- **Filtros:** la barra de arriba aplica a todas las láminas y se mantiene al
  cambiar de lámina. Funcionan en cascada: al elegir un jefe zonal, los filtros
  de localidad y local ofrecen solo lo suyo.
- **Rankings de cajeros y filtro de Grupo:** en las dos láminas de ranking el IP
  se calcula con las operaciones que dejan los filtros, así que elegir un grupo
  en la barra reordena el ranking y contesta «quién rinde más en ese grupo»
  (D-28). La categoría Alta/Media/Baja no cambia nunca: es la del año completo.
- **Detalle:** clic en una fila de tabla o en una celda abre un panel lateral sin
  salir de la lámina. Clic en un jefe zonal, localidad o local dentro de un
  gráfico aplica ese filtro.
- **Volver a una vista puntual:** el estado de los filtros y la lámina actual
  quedan en la URL.
- **PDF:** el botón *Imprimir* arma todas las láminas, una por página, con los
  filtros activos impresos en el encabezado.

---

## Estructura del proyecto

```
config.json                     Todos los parámetros y la paleta
vendor/echarts.min.js           Librería de gráficos, embebida en el HTML final
data/entrada/                   Datos reales (fuera del control de versiones)
data/ejemplo/                   Datos ficticios con la misma estructura
data/ejemplo_invalido/          Datos con un error de cada tipo, para probar las validaciones
data/maestros/zonales.csv       Asignación de locales a jefes zonales (se mantiene a mano)
conexion.ejemplo.ini            Plantilla de credenciales; copiar a conexion.ini
scripts/extraer_datos.py        Trae los datos directo de SQL Server a data/entrada
scripts/sql/                    Las dos queries: sf2.sql (SF2 sin TEC + TEC) y mt.sql
scripts/preparar_datos.py       Valida, arma el JSON columnar y escribe dist/presentacion.html
scripts/importar_canal_propio.py  Respaldo: traduce los datos del Dashboard Canal Propio
scripts/generar_ejemplo.py      Regenera data/ejemplo
src/plantilla.html              Esqueleto del HTML
src/estilos.css                 Estilos (variante offline de la skill presentation-slim)
src/js/
  formato.js                    Formato argentino
  metricas.js                   Motor de métricas — sin DOM, se prueba en Node
  datos.js                      Etiquetas, colores y descarga de CSV
  graficos.js                   Tema y helpers de ECharts
  filtros.js                    Barra de filtros en cascada y estado en la URL
  navegacion.js                 Láminas, notas, proyección, detalle e impresión
  vistas-*.js                   Las 38 láminas, una sección por archivo
  app.js                        Arranque
tests/metricas.test.js          Pruebas del motor
```

---

## Pruebas

```bash
node --test tests/metricas.test.js
```

Cubren los criterios de aceptación que no necesitan navegador: que la suma por
jefe zonal cierre contra el total de la red para cualquier combinación de
filtros, que los cajeros por categoría sumen el total con datos suficientes, que
**ningún filtro cambie la categoría de un cajero**, y el formato argentino de
números y fechas.

Para probar que el reporte de validación detecta cada tipo de error:

```bash
python scripts/preparar_datos.py --carpeta data/ejemplo_invalido --salida dist/invalido.html
type dist\validacion.txt
```
