# Prompt de desarrollo

Este prompt está pensado para Claude Code en VS Code. Exportá la pestaña Requerimiento como Markdown, guardala en la raíz del proyecto como REQUERIMIENTO.md y pegá el texto de abajo.

```markdown
# Contexto

Sos un desarrollador front-end senior con experiencia en visualización de datos. Vas a construir una presentación interactiva en HTML para Western Union Argentina: el jefe de jefes zonales la usa para mostrar a los jefes zonales la evolución anual de la red de locales y cajeros.

El requerimiento completo está en REQUERIMIENTO.md y es la fuente de verdad: métricas, definiciones, filtros y vistas se implementan exactamente como están ahí. Si algo no está definido o hay una contradicción, no lo inventes: tomá la opción más conservadora, registrala en DECISIONES.md y seguí.

# Skill de presentación

Usá la skill presentation-slim, ubicada en:
C:\Users\W0029557\Favorites\Downloads\Proyectos\WU-Operaciones-Argentina\Tecnologia\.agent\skills\presentation-slim

Antes de escribir código, leé su SKILL.md y los archivos que referencie. La skill define la estructura, el estilo visual y la navegación de las láminas; el requerimiento define los datos, las métricas, los filtros y el contenido de cada vista. Si se contradicen en diseño o navegación, prima la skill; si se contradicen en datos o métricas, prima el requerimiento. Registrá cada conflicto en DECISIONES.md.

# Entregables

- data/entrada/: archivos CSV o XLSX reales (excluidos del control de versiones).
- data/ejemplo/: conjunto de datos ficticio con la estructura de la sección 3.
- config.json: todos los parámetros de la sección 4.13 con sus valores por defecto.
- src/: plantilla HTML, estilos y JavaScript de la aplicación, separados por responsabilidad.
- scripts/preparar_datos.py: lee data/entrada (o data/ejemplo con --ejemplo), valida, genera el JSON columnar, lo inyecta junto con estilos, scripts y librerías en la plantilla y escribe dist/presentacion.html. Con --por-jefe-zonal genera además un archivo por jefe zonal con solo sus datos.
- dist/validacion.txt: reporte de validación de los datos de entrada.
- tests/: pruebas del motor de métricas.
- README.md: requisitos, cómo generar la presentación y formato de entrada.
- DECISIONES.md: supuestos tomados durante el desarrollo.

# Restricciones técnicas

- El HTML final es un único archivo autocontenido: funciona con doble clic, sin servidor y sin internet. Nada de CDN, fetch ni recursos externos.
- Gráficos con Apache ECharts, incluido inline en el HTML final (guardalo en vendor/ y que el script lo inyecte).
- JavaScript sin frameworks que requieran compilación. Módulos separados para datos, cálculo de métricas, estado de filtros, navegación y render de cada vista.
- El motor de métricas no depende del DOM, para poder probarlo en Node.
- Script de preparación en Python 3 con pandas y openpyxl.
- Formato argentino con Intl.NumberFormat('es-AR') y fechas dd/mm/aaaa.
- Objetivos: HTML de menos de 15 MB y menos de 1 segundo de respuesta al filtrar con el volumen real.

# Datos de ejemplo

Generá un conjunto ficticio realista: 6 jefes zonales, unos 60 locales en unas 25 localidades de 4 provincias, unos 350 cajeros, 20 meses (año anterior completo y año en curso hasta el mes anterior al actual), 4 tipos de operación y todas las tablas opcionales.

Incluí estos casos borde: cajeros que nunca operaron, altas y bajas durante el año, cajeros que cambiaron de local, cajeros con pocos días activos, locales sin coordenadas, un local con un mes sin datos y un pico estacional en diciembre. Usá nombres claramente ficticios.

# Orden de trabajo

1. Leé la skill presentation-slim y REQUERIMIENTO.md completos y listá dudas, ambigüedades o contradicciones antes de programar. Si alguna bloquea el trabajo, preguntame; si no, registrá tu supuesto en DECISIONES.md y seguí.
2. Generá los datos de ejemplo.
3. Implementá el script de preparación con todas las validaciones de la sección 3.
4. Implementá el motor de métricas de la sección 4, con pruebas que cubran como mínimo los criterios de aceptación de la sección 9 que no requieren navegador.
5. Implementá la navegación de la sección 6 y la barra de filtros de la sección 5.
6. Implementá las vistas en el orden de la sección 7, una sección por vez. Al terminar cada sección, generá el HTML y verificá que abre y funciona antes de pasar a la siguiente.
7. Aplicá la skill presentation-slim al diseño de las láminas, completando con lo que indique la sección 8 del requerimiento.
8. Verificá cada criterio de aceptación de la sección 9.

# Reglas obligatorias

- Las categorías de productividad se calculan con el período seleccionado sobre toda la red. Ningún otro filtro las modifica.
- Ninguna métrica usa una definición distinta de la del requerimiento.
- Las vistas opcionales se ocultan si falta su dato; nunca muestran gráficos vacíos ni errores.
- Todos los parámetros se leen de config.json; no hay umbrales escritos en el código.
- Los datos reales no salen del equipo: sin servicios externos, sin telemetría y sin logs con datos de cajeros.

# Al terminar

Respondé con:

1. Resumen de lo construido y estructura de archivos.
2. Comandos para generar la presentación con datos de ejemplo y con datos reales.
3. Resultado de cada criterio de aceptación: cumple o no cumple, y cómo se verificó.
4. Supuestos tomados, resumidos desde DECISIONES.md.
5. Pendientes o limitaciones conocidas.
```
