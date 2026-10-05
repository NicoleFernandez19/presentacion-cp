# Presentación anual de la red — Requerimiento

2026-09-21 · @Someone

## 1. Objetivo y uso

Se requiere una presentación interactiva en HTML para que el jefe de jefes zonales muestre a los jefes zonales la evolución de la red durante el año. Cubre volumen de transacciones, actividad y productividad de los cajeros, distribución por jefe zonal y por tipo de zona, y rankings.

- **Presentador:** el jefe de jefes zonales, que la recorre lámina por lámina en una reunión proyectada.
- **Destinatarios:** los jefes zonales, que después pueden abrir el archivo y filtrar los datos de su zona.
- **Foco temporal:** datos del año (acumulados, evolución mensual y trimestral). El mes individual es un valor del filtro de período, no una sección propia.
- **Actualización:** los datos se regeneran con un script de preparación cada vez que se quiera actualizar la presentación.

## 2. Formato y restricciones técnicas

El entregable es un único archivo HTML autocontenido que funciona sin servidor y sin conexión a internet.

- Se abre con doble clic en Chrome o Edge de escritorio, en sus versiones actuales.
- Las librerías de gráficos y utilidades van incluidas dentro del archivo, sin CDN, para que funcione en redes corporativas con restricciones.
- Los datos van embebidos en el HTML en formato JSON columnar compacto. Los genera un script de preparación a partir de archivos CSV o XLSX.
- El script puede generar una versión completa y, opcionalmente, una versión por jefe zonal que contenga solo los datos de su zona.
- Todos los cálculos que dependen de filtros se hacen en el navegador.
- No hay almacenamiento externo ni envío de datos a ningún servicio.
- Tamaño objetivo del archivo: menos de 15 MB. Respuesta al cambiar un filtro: menos de 1 segundo con el volumen real.
- Idioma de la interfaz: español. Formato numérico argentino (punto de miles, coma decimal), fechas dd/mm/aaaa y nombres de meses en español.

## 3. Datos de entrada

Se necesitan cuatro tablas obligatorias y cinco opcionales, en CSV (UTF-8, separador punto y coma) o XLSX. Las vistas que dependen de una tabla o columna opcional se ocultan si ese dato no está.

El script de preparación valida los datos y genera un reporte con: IDs sin correspondencia en los maestros, filas duplicadas, meses faltantes, tipos de operación no reconocidos, valores negativos y días activos mayores a los días del mes.

### 3.1 transacciones\_mensuales (obligatoria)

Una fila por año, mes, cajero, local y tipo de operación.

| Columna | Obligatoria | Descripción |
| --- | --- | --- |
| anio | Sí | Año de la operación |
| mes | Sí | Mes de la operación (1 a 12) |
| id\_cajero | Sí | Identificador del cajero |
| id\_local | Sí | Local donde se hizo la operación; contempla cajeros que cambiaron de local |
| tipo\_operacion | Sí | Tipo de operación según la clasificación interna |
| cantidad | Sí | Cantidad de operaciones |
| monto | No | Monto total operado, en pesos |
| cantidad\_rechazadas | No | Operaciones rechazadas, canceladas o revertidas |

### 3.2 actividad\_mensual (obligatoria)

Una fila por año, mes y cajero.

| Columna | Obligatoria | Descripción |
| --- | --- | --- |
| anio | Sí | Año |
| mes | Sí | Mes (1 a 12) |
| id\_cajero | Sí | Identificador del cajero |
| dias\_activos | Sí | Días distintos del mes con al menos una operación |

### 3.3 cajeros (obligatoria)

| Columna | Obligatoria | Descripción |
| --- | --- | --- |
| id\_cajero | Sí | Identificador del cajero |
| nombre\_cajero | Sí | Nombre y apellido |
| id\_local\_actual | Sí | Local asignado actualmente |
| fecha\_alta | Sí | Fecha de habilitación del usuario |
| fecha\_baja | No | Fecha de baja; vacía si sigue habilitado |

### 3.4 locales (obligatoria)

| Columna | Obligatoria | Descripción |
| --- | --- | --- |
| id\_local | Sí | Identificador del local |
| nombre\_local | Sí | Nombre del local |
| localidad | Sí | Localidad |
| provincia | Sí | Provincia |
| jefe\_zonal | Sí | Jefe zonal a cargo |
| tipo\_zona | No | Alto o Bajo movimiento; si falta, se calcula según 4.6 |
| fecha\_apertura | No | Fecha de apertura del local |
| fecha\_cierre | No | Fecha de cierre, si corresponde |
| latitud | No | Coordenada para el mapa |
| longitud | No | Coordenada para el mapa |

### 3.5 Tablas opcionales

| Tabla | Columnas | Habilita |
| --- | --- | --- |
| hitos | fecha, titulo, descripcion, jefe\_zonal (vacío = toda la red) | Marcadores en la línea temporal |
| actividad\_horaria | anio, mes, id\_local, dia\_semana (1 a 7), hora (0 a 23), cantidad | Vista de día y franja horaria |
| capacitaciones | id\_cajero, fecha, nombre\_capacitacion | Vista de capacitaciones y productividad |
| textos\_cierre | jefe\_zonal (vacío = toda la red), hallazgos, objetivos | Láminas de hallazgos y próximos pasos |
| Año anterior | Mismo formato que 3.1 y 3.2 | Comparación interanual |

## 4. Definiciones y reglas de negocio

Todas las métricas se calculan con estas definiciones. Los valores numéricos son parámetros configurables (tabla 4.13).

### 4.1 Período

El período por defecto es el año calendario en curso hasta el último mes con datos completos. La comparación interanual usa los mismos meses del año anterior.

### 4.2 Estado del cajero en un mes

- **Habilitado:** fecha de alta anterior o igual al fin del mes, y sin fecha de baja o con baja posterior al inicio del mes.
- **Activo:** habilitado con al menos una operación en el mes.
- **Inactivo:** habilitado sin operaciones en el mes.
- **Nunca operó:** habilitado en el período y sin ninguna operación en todo el período.

### 4.3 Meses activos

Proporción de meses en que el cajero estuvo activo, sobre los meses del período en que estuvo habilitado. Tramos: 100%, 75% a 99%, 50% a 74%, menos de 50% y nunca operó.

### 4.4 Índice de productividad (IP)

El IP de un cajero es su cantidad de operaciones por día activo en el período, considerando todos los tipos de operación.

```latex
IP = \frac{\text{operaciones del período}}{\text{días activos del período}}
```

Para recibir categoría y entrar en rankings, el cajero necesita un mínimo de días activos en el período. Por debajo del mínimo se muestra como "Sin datos suficientes".

### 4.5 Tipo de zona

Cada localidad es de alto o de bajo movimiento. Si la tabla de locales trae la columna tipo\_zona, se usa ese valor. Si no, se calcula una sola vez con el año completo: el porcentaje configurado de localidades con más operaciones es de alto movimiento y el resto de bajo.

### 4.6 Categorías de productividad

Cada cajero se clasifica en Alta, Media o Baja comparando su IP con el de los cajeros de su mismo tipo de zona. Por defecto, el tercio superior es Alta, el tercio medio es Media y el tercio inferior es Baja.

Los umbrales dependen solo del período seleccionado y se calculan sobre toda la red. Los filtros de jefe zonal, localidad, local y tipo de operación no cambian la categoría de ningún cajero; solo cambian qué cajeros se muestran.

### 4.7 Categoría de un local

La categoría de un local se define por el IP promedio de sus cajeros con datos suficientes, comparado con los locales de su mismo tipo de zona y con los mismos cortes por tercios.

### 4.8 Mejora en el año

La mejora de un cajero es la diferencia de su percentil de IP dentro de su tipo de zona entre el primer y el último trimestre completo del período. Se usa el percentil y no el IP para que cajeros de zonas de alto y bajo movimiento sean comparables. El cajero necesita el mínimo de días activos en ambos trimestres.

### 4.9 Rankings

Los rankings de cajeros tienen dos modos, seleccionables en la vista:

- **Relativo (por defecto):** ordena por percentil de IP dentro del tipo de zona; desempata por IP.
- **Absoluto:** ordena por IP.

Con un solo jefe zonal seleccionado, el ranking se limita a sus cajeros y agrega una columna con la posición de cada uno en el ranking general de la red.

### 4.10 Comparación de locales

Cada local se compara contra el promedio de un grupo de referencia, seleccionable en la vista: misma localidad, mismo jefe zonal o mismo tipo de zona. Se comparan IP promedio, operaciones por cajero, porcentaje de cajeros inactivos y distribución de categorías.

### 4.11 Concentración

Porcentaje de las operaciones del período que concentra el 20% de cajeros con más operaciones.

### 4.12 Antigüedad

Tiempo desde la fecha de alta del cajero hasta el fin del período. Tramos: menos de 6 meses, 6 a 12 meses, 1 a 3 años y más de 3 años.

### 4.13 Parámetros configurables

| Parámetro | Valor por defecto |
| --- | --- |
| Mínimo de días activos para categoría y ranking | 5 por cada mes del período |
| Cortes de categorías de productividad | Percentiles 33 y 67 dentro del tipo de zona |
| Localidades de alto movimiento (si se calcula) | 30% con más operaciones |
| Tamaño de los rankings de cajeros | 20 mejores y 20 peores |
| Tamaño del ranking de mejora | 10 cajeros |
| Tamaño de los rankings de locales | 10 mejores y 10 peores |
| Porcentaje para concentración | 20% de cajeros |

## 5. Filtros globales

Una barra fija en la parte superior contiene los filtros, que aplican a todas las láminas y se mantienen al cambiar de lámina.

| Filtro | Opciones | Valor por defecto |
| --- | --- | --- |
| Período | Año completo, trimestre, mes o rango de meses | Año completo |
| Jefe zonal | Selección múltiple | Todos |
| Tipo de zona | Alto, Bajo o ambos | Ambos |
| Localidad | Selección múltiple, dependiente de jefe zonal | Todas |
| Local | Selección múltiple, dependiente de localidad | Todos |
| Tipo de operación | Selección múltiple | Todos |
| Comparar con año anterior | Sí o No; visible solo si hay datos del año anterior | No |
| Mostrar cajeros | Nombre o solo ID | Nombre |

Comportamiento:

- Los filtros funcionan en cascada: al elegir un jefe zonal, los filtros de localidad y local muestran solo sus opciones.
- Los filtros activos se muestran como etiquetas con opción de quitarlos uno por uno, más un botón para limpiar todos.
- Hacer clic en un jefe zonal, localidad o local dentro de un gráfico aplica ese filtro.
- El estado de los filtros y la lámina actual se guardan en la URL, para poder volver a una vista puntual.
- Una vista que pierde sentido con los filtros activos lo indica o se adapta. Por ejemplo, con un solo jefe zonal seleccionado, el conteo por jefe zonal de los rankings se reemplaza por la posición en el ranking general.

## 6. Navegación y modo presentación

La presentación muestra una lámina por pantalla en formato 16:9, adaptada a proyección en 1920 × 1080 y a notebooks de 1366 × 768.

- **Teclado:** flechas y Av Pág / Re Pág para avanzar y retroceder (compatible con punteros de presentación), Inicio y Fin, F para pantalla completa.
- **Índice lateral:** lista de secciones y láminas, desplegable, con salto directo.
- **Encabezado de cada lámina:** sección, título y número de lámina.
- **Detalle:** en tablas y matrices, clic en una fila o celda abre un panel lateral con el detalle del cajero o local, sin salir de la lámina.
- **Impresión:** una hoja de estilos de impresión permite exportar a PDF desde el navegador, una lámina por página, con los filtros activos impresos en el encabezado.

## 7. Contenido

La presentación tiene 38 láminas en siete secciones y un anexo. Las láminas marcadas como opcionales dependen de datos opcionales y se ocultan si falta el dato.

### 7.1 Resumen del año

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 1 | Portada | Título, período analizado, fecha de corte de los datos y objetivo de la reunión | Texto |
| 2 | Indicadores del año | Operaciones acumuladas, variación interanual, promedio mensual, locales, cajeros habilitados, cajeros activos promedio por mes, % de cajeros en Alta y % de cajeros que operaron todos los meses | Tarjetas con valor y variación |
| 3 | Mapa de calor anual | Operaciones por mes y jefe zonal; alterna con variación interanual por celda | Mapa de calor meses × jefes zonales |

### 7.2 Evolución del año

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 4 | Línea temporal | Operaciones y cajeros activos por mes, con los hitos marcados | Líneas con doble eje y marcadores |
| 5 | Evolución por jefe zonal | Operaciones por mes, una línea por jefe zonal | Líneas múltiples |
| 6 | Evolución por tipo de operación | Operaciones por mes y tipo; alterna cantidad y porcentaje | Barras apiladas |
| 7 | Evolución de la red | Locales y cajeros habilitados por mes, con altas y bajas | Líneas con barras de altas y bajas |

### 7.3 Estructura de la red

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 8 | Red por jefe zonal | Locales, cajeros y promedio de cajeros por local | Barras agrupadas con tabla |
| 9 | Distribución por tipo de zona | Locales y cajeros de cada jefe zonal en zonas de alto y bajo movimiento | Barras apiladas |
| 10 | Localidades de alto movimiento | Ranking con operaciones, locales, cajeros e IP promedio | Barras horizontales |
| 11 | Localidades de bajo movimiento | Ranking con operaciones, locales, cajeros e IP promedio | Barras horizontales |
| 12 | Crecimiento por localidad | Localidades que más crecieron y más cayeron, entre el primer y el último trimestre o contra el año anterior | Barras divergentes |
| 13 | Mapa de locales (opcional) | Un punto por local; tamaño según operaciones, color según tipo de zona o categoría | Mapa con contorno de provincias embebido, sin mapas en línea |

### 7.4 Actividad del año

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 14 | Activos e inactivos por mes | Cajeros que operaron y que no operaron cada mes, total y por jefe zonal | Barras apiladas por mes |
| 15 | Meses activos | Cajeros por tramo de meses activos y por jefe zonal, con listado de los que nunca operaron | Barras apiladas y tabla |
| 16 | Operaciones por jefe zonal y tipo | Operaciones acumuladas por jefe zonal, desagregadas por tipo de operación | Barras horizontales apiladas |
| 17 | Operaciones promedio | Operaciones por cajero activo y por local, por jefe zonal, con el promedio de la red como referencia | Barras con línea de referencia |
| 18 | Concentración | Curva acumulada de operaciones por cajero y porcentaje que concentra el 20% superior | Curva de Pareto |
| 19 | Montos (opcional) | Monto total y monto promedio por operación, por jefe zonal y tipo | Barras |
| 20 | Rechazos (opcional) | Tasa de operaciones rechazadas, canceladas o revertidas por jefe zonal y por mes | Barras con línea |
| 21 | Día y franja horaria (opcional) | Operaciones por día de la semana y hora | Mapa de calor días × horas |

### 7.5 Productividad

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 22 | Criterio de categorías | Explicación del IP, segmentación por tipo de zona y umbrales vigentes con sus valores | Texto y tabla |
| 23 | Nivel de cada cajero por local | Una fila por local y los cajeros como celdas coloreadas por categoría; tooltip con IP y días activos | Grilla ordenable |
| 24 | Categorías por jefe zonal | Cantidad de cajeros en Alta, Media y Baja; alterna cantidad y porcentaje | Barras apiladas |
| 25 | Evolución trimestral de categorías | Distribución Alta, Media y Baja por trimestre y jefe zonal | Barras apiladas al 100% en paneles |
| 26 | Movimiento entre categorías | Cajeros según su categoría en el primer y el último trimestre; clic en una celda lista los cajeros | Matriz de transición |
| 27 | Consistencia | Cajeros en Alta todos los trimestres y cajeros en Baja todos los trimestres, por jefe zonal | Tarjetas y listados |
| 28 | Comparación de locales | Cada local frente a su grupo de referencia | Barras con línea de referencia y dispersión IP vs. operaciones |
| 29 | Antigüedad y productividad | IP promedio y distribución de categorías por tramo de antigüedad | Barras |
| 30 | Capacitaciones (opcional) | IP de los cajeros antes y después de cada capacitación | Líneas |

### 7.6 Rankings

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 31 | Top 20 mejores cajeros | Posición, cajero, local, localidad, jefe zonal, tipo de zona, IP, operaciones, días activos y categoría; debajo, cantidad por jefe zonal | Tabla y barras |
| 32 | Top 20 peores cajeros | Mismas columnas; debajo, cantidad por jefe zonal | Tabla y barras |
| 33 | Mayor mejora del año | 10 cajeros con mayor mejora, con percentil inicial y final | Tabla con indicador de variación |
| 34 | Mejores y peores locales | 10 mejores y 10 peores por IP promedio de sus cajeros, con jefe zonal y tipo de zona | Dos tablas |

### 7.7 Cierre

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 35 | Hallazgos por zona | Resumen calculado por jefe zonal (variación anual, % en Alta, % de inactivos, posición en la red) más el texto de textos\_cierre | Tarjetas por jefe zonal |
| 36 | Objetivos y próximos pasos | Texto de textos\_cierre por jefe zonal y para la red | Texto |

### 7.8 Anexo

| # | Vista | Contenido | Visualización |
| --- | --- | --- | --- |
| 37 | Tabla de cajeros | Todas las métricas por cajero, con búsqueda, orden por columna y descarga en CSV de la vista filtrada | Tabla |
| 38 | Tabla de locales | Todas las métricas por local, con búsqueda, orden por columna y descarga en CSV de la vista filtrada | Tabla |

## 8. Diseño visual

El estilo es sobrio y corporativo, pensado para leerse proyectado en una sala.

- **Paleta:** fondo claro, texto oscuro y amarillo y negro como colores de acento, en línea con la identidad corporativa.
- **Colores fijos:** cada categoría de productividad y cada jefe zonal tiene un color que se mantiene igual en todas las vistas. La paleta es apta para daltonismo y el color nunca es la única señal: las categorías llevan también etiqueta.
- **Línea de lectura:** cada lámina muestra bajo el título una frase con el dato principal, calculada según los filtros activos. Por ejemplo: "El 34% de los cajeros de la red está en productividad alta, 5 puntos más que en el primer trimestre".
- **Legibilidad:** títulos de al menos 28 px y textos de gráficos de al menos 14 px en 1920 × 1080. Tooltips con valores exactos en todos los gráficos.
- **Estados vacíos:** si una combinación de filtros no tiene datos, la vista lo dice en lugar de mostrar un gráfico vacío.

## 9. Criterios de aceptación

La presentación se considera terminada cuando cumple todos estos puntos, verificados con el conjunto de datos de prueba y con los datos reales.

- [ ] Abre sin conexión a internet con doble clic en Chrome y Edge, sin errores en la consola.
- [ ] La suma de operaciones por jefe zonal coincide con el total de la red para cualquier combinación de período y tipo de operación.
- [ ] La cantidad de cajeros por categoría suma el total de cajeros con datos suficientes del período.
- [ ] Cambiar los filtros de jefe zonal, localidad, local o tipo de operación no cambia la categoría de ningún cajero.
- [ ] Con un solo jefe zonal seleccionado, los rankings muestran la posición de cada cajero en el ranking general.
- [ ] Las vistas opcionales se ocultan cuando falta su dato, sin errores.
- [ ] El script de preparación detecta y reporta cada tipo de error de la sección 3.
- [ ] La respuesta al cambiar un filtro es menor a 1 segundo con el volumen real de datos.
- [ ] Todos los números y fechas usan formato argentino.
- [ ] Existe un conjunto de datos ficticio con la misma estructura de entrada para pruebas y demostraciones.

## 10. Decisiones pendientes de validar

Estos puntos tienen un valor propuesto en este requerimiento y conviene confirmarlos con el jefe de jefes zonales antes de desarrollar.

- [ ] Definición del IP como operaciones por día activo, y cortes de categorías por tercios dentro del tipo de zona.
- [ ] Criterio de alto y bajo movimiento: dato existente o cálculo propio, y porcentaje de corte.
- [ ] Mínimo de días activos para categoría y rankings.
- [ ] Asignación de locales a jefes zonales: se propone usar la vigente para todo el año, aunque haya habido cambios.
- [ ] Qué se considera "zona" al comparar locales: localidad, jefe zonal o tipo de zona.
- [ ] Distribución del archivo: una versión completa para todos o una versión por jefe zonal, dado que contiene datos nominales de cajeros.
- [ ] Lista de tipos de operación y sus nombres visibles.
- [ ] Volumen aproximado: cantidad de cajeros, locales y meses a incluir.
- [ ] Disponibilidad de los datos opcionales: montos, rechazos, horarios, coordenadas, capacitaciones y año anterior.
