# Decisiones y supuestos

Registro de cada decisión tomada durante el desarrollo: las confirmadas por la
usuaria, las que resuelven una contradicción entre la skill `presentation-slim` y
`Requerimiento.md`, y los supuestos adoptados donde el dato real no alcanza para
lo que pide el requerimiento.

Regla de resolución (definida en `Prompt.md`): ante contradicción de **diseño o
navegación** prima la skill; ante contradicción de **datos o métricas** prima el
requerimiento. Lo no definido se resuelve por la opción más conservadora y se
anota acá.

---

## 1. Confirmadas con la usuaria (2026-09-21)

### D-01 — Tres grupos: SF2 sin TEC, TEC y MT

**Decisión (2026-09-21, revisada el mismo día):** la presentación se organiza en
**tres grupos**, cada uno con sus propios tipos de operación:

| Grupo | Recorte | Tipos de operación | Operaciones 2026 |
|---|---|---|---:|
| **SF2 sin TEC** | `PLA_Transacciones_SF2`, todos los paycodes menos `E0O` | SF2 Positivo · Positivo Débito · Positivo QR · Negativos · Otro TipoOpe | 24.459.723 |
| **TEC** | `PLA_Transacciones_SF2` con `IdPaycode = 'E0O'` | Negativos (los desembolsos son movimiento negativo de caja) | 19.374 |
| **MT** | `PLA_Transacciones_MT` (Wupos) | Envíos · Pagos | 1.522.245 |

**Por qué así:** las fuentes del dashboard se solapan entre sí (SF2 completo ⊇
TEC; Collection es otro recorte de SF2+MT), así que sumarlas duplicaba
operaciones. Separar por paycode TEC y sumar MT aparte cubre el 100% del volumen
sin superposición, y deja los tres universos comparables entre sí.

**Consecuencias:**

- `transacciones_mensuales` gana una columna **`grupo`**, que no está en
  `Requerimiento.md` §3.1. Es la única extensión al esquema de entrada.
- Hay un filtro global **Grupo** además del de tipo de operación, en cascada:
  al elegir un grupo, el filtro de tipo ofrece solo los suyos.
- Una lámina nueva (**Los tres grupos de operaciones**) los muestra lado a lado,
  cada uno con su propia escala: TEC mueve tres órdenes de magnitud menos que
  SF2, así que una pila o un eje compartido lo dejaría invisible.
- **Versión anterior descartada:** el universo eran los cuatro valores de
  `Tipo Ope` de `consolidado_collection.csv` (el recorte "efectivo"). Se
  reemplazó porque dejaba TEC y el resto de los paycodes SF2 afuera.

### D-24 — Sin importes: la presentación habla solo de transacciones

**Decisión (2026-09-21):** se sacó todo lo relativo a montos. No hay columna
`monto` en los datos, ni KPI, ni tooltip, ni columna de CSV, ni lámina de
montos (la 19 del requerimiento §7.4 ya no existe).

**Por qué:** la reunión es sobre volumen y productividad de la red, no sobre
facturación. Además, en el dato real los importes vienen con signo según el tipo
de operación, lo que obligaba a explicar en cada lámina qué significaba un total
negativo.

**Consecuencia:** las láminas quedan en **38 con el dataset de ejemplo** (que
tiene todos los datos opcionales) y **33 con datos reales**. §7 del requerimiento
sigue siendo la referencia de contenido, menos la lámina de montos.

### D-25 — Los datos se traen directo de SQL Server

**Decisión (2026-09-21):** `scripts/extraer_datos.py` se conecta a la base
(`WUTeller` en `DBPRODCL01`) y arma `data/entrada/` por su cuenta, con dos
queries propias en `scripts/sql/`. La presentación ya no depende de que el
Dashboard Canal Propio esté instalado ni de que su pipeline haya corrido.

`scripts/importar_canal_propio.py` queda como camino de respaldo, para cuando
haya acceso a la carpeta del dashboard pero no a la base.

**Lo que sigue viniendo de un archivo:** la asignación de locales a jefes
zonales, que no existe en la base. Se copió el maestro a
`data/maestros/zonales.csv` y se mantiene ahí.

**Credenciales:** `conexion.ini` en la raíz (excluido de git, con plantilla en
`conexion.ejemplo.ini`). Si no está, el script usa el `config.ini` del dashboard,
que tiene las mismas credenciales, para no duplicar la contraseña en dos lugares.

⚠️ **Pendiente de correr contra la base.** La ejecución quedó bloqueada por los
permisos del entorno (lectura contra producción). El script está escrito y las
queries listas, pero **todavía no se probaron contra el servidor**: hasta que se
corran, los datos reales del proyecto salen del importador.

### D-26 — Cajeros: dotación promedio, y con actividad contra sin actividad

**Decisión (2026-09-21):** donde se habla de cajeros, la métrica es el
**promedio de cajeros habilitados por mes** del período —no un total acumulado de
legajos distintos, que crece con el largo del período y no se puede comparar
entre recortes— y el contraste principal es **los que operaron contra los que
no**.

**Detalle que importa:** "con actividad" se mide **sin aplicar los filtros**. Un
cajero que ese mes operó en otra zona, en otro local o en otro grupo trabajó
igual. Si se midiera dentro del recorte, al filtrar por una zona aparecían como
inactivos todos los que se habían movido de local: la red daba 0,5% de
inactividad y una zona 11,7%, midiendo cosas distintas con el mismo nombre.

**Corrección (2026-09-22): el número principal es el de operadores, no el de
habilitados.** La primera versión encabezaba con "cajeros habilitados" (926
promedio) y ese número no coincidía con nada que se pudiera auditar: al inferir
altas y bajas de la actividad (D-08), un legajo que operó en enero y volvió en
junio cuenta como habilitado en el medio, así que la cifra queda 5 a 12 por mes
por encima de la real y nadie puede reconciliarla.

Ahora las láminas encabezan con **operadores**: legajos distintos que operaron en
el mes. Ese número **coincide exactamente** con la fuente y con el tablero de
origen — 939, 940, 934, 922, 906, 912, 907 y 907 de enero a agosto de 2026.

`preparar_datos.py` detecta si las altas y bajas son un dato propio o están
inferidas (compara cada alta contra el primer mes con operaciones del legajo: si
coinciden en el 90% o más, están inferidas) y lo deja en
`meta.altas_inferidas`. Cuando lo están:

- la dotación se rotula **"Dotación estimada"**, con la aclaración de que no es
  un padrón;
- lo que antes era "sin actividad" pasa a llamarse **"meses sin operar"**, que es
  lo que realmente mide: huecos intermedios, no inactividad de la red;
- las notas del orador explican por qué, para que nadie presente ese número como
  dotación real.

Con un padrón de usuarios habilitados de verdad, el mismo código vuelve solo a
"cajeros habilitados" y "sin actividad": la detección es automática.

**Otra diferencia esperable:** los operadores del período dan **1.065** y no los
1.076 legajos del archivo, porque el período por defecto llega hasta el último
mes completo (agosto) y 11 legajos operaron solo en septiembre (D-12). La tarjeta
dice explícitamente entre qué meses cuenta.

### D-02 — El IP se calcula por **mes activo**, no por día activo

**Definición vigente:**

```
IP = operaciones del período ÷ meses activos del período
```

**Por qué:** ninguna fuente real tiene granularidad diaria para todos los tipos
de operación. La única con fecha por transacción es
`consolidado_tec_detalle.csv`, que cubre solo el producto TEC (paycode `E0O`),
una porción chica del volumen. Calcular el IP con esa fuente habría
subestimado a todo cajero cuya actividad es principalmente MT o SF2.

**Se aparta de `Requerimiento.md` §4.4**, que define el IP como operaciones por
día activo. Cambio confirmado por la usuaria.

**Consecuencias en cadena:**

- `actividad_mensual` (§3.2) pasa de obligatoria a **opcional**. Si está, sus
  `dias_activos` se muestran como columna informativa en las tablas de cajeros y
  en los tooltips; si no, esa columna se oculta. El IP nunca la usa.
- Un cajero está **activo** en un mes si tiene al menos una operación en ese mes
  (se deriva de `transacciones_mensuales`, sin depender de `actividad_mensual`).
- El parámetro "mínimo de días activos" (§4.13) se reemplaza por
  **`minimo_meses_activos`**, por defecto **3**. Equivale en espíritu al umbral
  original (≈25% del período: 5 días sobre ~21 hábiles). Configurable.
- Para "mejora en el año" (§4.8), que exige el mínimo en el primer y el último
  trimestre, el umbral por trimestre es **`minimo_meses_activos_trimestre`**,
  por defecto **2** de 3 meses.
- §4.3 (tramos de meses activos) no cambia: ya estaba definida en meses.

---

### D-27 — Cómo se compara a los jefes zonales entre sí

**Decisión (2026-09-22):** la comparación entre jefes zonales es un índice de
cuatro pilares, todos medidos **por cajero-mes** y contra un **grupo de pares
exógeno**. Vive en `motor.gestionZonal()` y se muestra en las tres últimas
láminas de *Avances y retrocesos*.

| Pilar | Qué mide | Peso |
|---|---|---:|
| Rendimiento | operaciones reales ÷ esperadas según el grupo de pares | 40% |
| Cobertura | cajero-meses con operaciones ÷ cajero-meses habilitados | 20% |
| Cola crónica | % de sus cajeros bajo el percentil 25 de sus pares en 6 meses o más | 20% |
| Avance | operaciones por operador, ventana final contra inicial | 20% |

El índice es el promedio ponderado del **percentil de cada pilar entre los jefes
comparados**, no de los valores crudos: así ningún pilar domina por tener una
escala más grande. Todos los umbrales están en `config.json` →`gestion_zonal`.

**Por qué no alcanzaba con el volumen.** Medido sobre el dato real de 2026
(202601 a 202608):

- la correlación entre las operaciones de una zona y su dotación es **0,84**, o
  sea que ordenar por volumen es ordenar por cuánta gente tiene cada uno;
- de la varianza de las operaciones por cajero-mes, el jefe zonal explica el
  **2,2%**; el local, el 30,6%; el cajero, el 48,2%;
- entre el mejor y el peor jefe hay 28% de brecha en la mediana por cajero-mes;
  entre locales hay 106% y entre cajeros 212%.

Con esos números, el nivel de una zona es sobre todo su dotación y su plaza. Lo
que sí es del jefe zonal es **a quién detecta, a quién recupera y cómo reparte
la dotación** — y eso es lo que miden los cuatro pilares.

#### Las reglas que hacen que sea justo

**1. El grupo de pares es exógeno.** Nunca se calcula con el volumen. Prioridad:

1. `data/entrada/plazas.csv` (`id_local;plaza`), que es donde entra la
   categorización de negocio si existe;
2. la columna `region` de `locales.csv` (es lo que se usa hoy: 6 grupos);
3. `provincia`;
4. toda la red en un solo grupo.

Los grupos que no llegan a `minimo_cajero_mes` (200) se funden en uno solo: una
mediana apoyada en cuatro observaciones no es una vara. El reporte de validación
lista cada grupo con su base en el bloque 8.

⚠️ **La región se puede perder en silencio.** El 2026-09-22 una regeneración de
`data/entrada/` dejó la columna `region` vacía en los 310 locales, porque el
importador la agregaba al armar el maestro pero no la incluía en la lista de
columnas que proyecta antes de pasarlo. El grupo de pares cayó solo de 6
regiones a 4 provincias y nadie se enteró. Ya está corregido y el importador
**avisa por pantalla** si la fuente no trae `REGION`; igual conviene mirar el
bloque 8 del reporte después de cada regeneración: si dice «provincia» en vez de
«columna region de locales», el ranking de gestión está usando una vara peor.

> Esto es lo contrario de lo que hace `tipo_zona` (§4.5), que sale del propio
> volumen: ahí el 30% de localidades con más operaciones es "alto movimiento".
> Definir el grupo con el resultado hace que un local flojo termine comparado
> contra otros flojos, y **el criterio absuelve justo lo que tiene que
> detectar**. `gestionZonal()` no usa `tipo_zona` por ese motivo. Las láminas de
> categorías y de rankings de cajeros lo siguen usando: cambiarlo es una
> definición de negocio, no un bug, y está pendiente.

**2. La dotación NO entra en el grupo de pares.** Medido: las operaciones por
cajero-mes caen de ~3.200 en puntos de 2-3 cajeros a ~1.800-2.200 en puntos de
6 o más, y la caída se sostiene **dentro de cada región**. Poner más gente en un
punto es una decisión del jefe zonal, así que tiene que verse en el resultado,
no normalizarse.

**3. Las aperturas, las bajas y las mudanzas quedan afuera de las comparaciones
de nivel.** Los locales entran en la brecha de plaza solo con
`minimo_meses_local` (6) meses de actividad. Sin esta regla, los dos peores
locales del año serían C.S. BELGRANO JH y C.S. RESISTENCIA III, que no son
locales flojos: son **traslados** de julio-agosto de 2026 (cuatro y dos legajos
que se mudaron desde C.S. BELGRANO y C.S. RESISTENCIA). La caída del 61% de
C.S. BELGRANO en agosto es la contracara del mismo traslado.

**4. El avance usa la ventana móvil de `ventanaComparacion`, no trimestres
calendario.** Es el mismo número que muestra el ranking de avance, así que las
dos láminas hablan de lo mismo. Con trimestres calendario y datos hasta agosto
se compararía T1 contra T2 y quedarían afuera julio y agosto.

**5. Se presenta en tres grupos, no en un orden del 1 al 10.** Un remuestreo de
los cajeros de cada zona (400 iteraciones, semilla fija en `config.json` para
que la pantalla y el PDF muestren lo mismo) da la banda de posiciones posibles.
Con el dato real, las posiciones del medio se superponen entre sí: solo los
extremos se sostienen.

**6. Un cajero se le imputa a un solo jefe zonal:** el del local donde más operó
en el período (mismo criterio que D-19). Con 466 legajos operando en más de un
local (D-09), repartir a la persona entre zonas haría que nadie responda por
ella. Por eso las operaciones por jefe de esta lámina **no coinciden exactamente**
con las de las láminas que agrupan por local.

#### Consecuencias medidas sobre el dato real

- El orden por gestión es casi independiente del orden por volumen. El primero
  por volumen queda **décimo** por gestión; el noveno por volumen queda cuarto.
- La cola crónica son **83 cajeros de 852 evaluados**, y llevarlos a la mediana
  de sus pares vale **835.907 operaciones, 3,5% del volumen del período**. Es la
  palanca más grande de las que salen del criterio.
- La brecha dentro de una misma plaza aparece en **5 localidades** y vale
  125.535 operaciones (0,5%). Es real pero chica: sin jefe de local en la línea
  de mando, la unidad de responsabilidad es la persona, no el punto.
- **Córdoba no aparece.** En un cálculo preliminar daba 2,03x de brecha interna,
  pero ese número repartía el mes de un cajero entre varios locales. Con el
  criterio definitivo —cada cajero-mes imputado a un solo local— los seis locales
  de Dardo Ricci en Córdoba van de 3.663 a 3.078 operaciones por cajero-mes:
  **1,19x**, debajo del umbral de 1,4x.

**La cobertura no pondera con el dato real.** Como las altas y las bajas se
infieren de la propia actividad (D-08, corregido en D-26), "habilitado" es casi
lo mismo que "activo" y el pilar da entre 98,9% y 100% para las diez zonas.
Ordenar por esa diferencia sería ordenar por ruido, así que cuando
`meta.altas_inferidas` es verdadero el pilar **se muestra en gris y sale del
promedio**, y su peso se reparte entre los otros tres. Si algún día hay un padrón
de habilitaciones, vuelve a ponderar solo.

⚠️ **Pendiente de validar con negocio.** Los cuatro pilares, sus pesos y el
umbral de la cola crónica son una propuesta, no una definición acordada. La
pregunta concreta para negocio es **si existe una categorización de plaza o de
sucursal** (A/B/C, potencial, población) que se pueda usar como grupo de pares:
si existe, entra por `plazas.csv` sin tocar una línea de código.

**(Sin efecto desde 2026-10-05: ya no hay archivo por jefe zonal, ver D-15.)**
**En el archivo por jefe zonal la vara cambiaba de significado.** Ese
archivo trae solo los locales y las filas de una zona, así que la mediana del
grupo de pares pasa a calcularse con los cajeros de esa misma zona: el
rendimiento da cerca de 1,00 por construcción y la cola crónica se vuelve "el
cuarto de abajo de tu propia zona". Es la misma propiedad que ya tenían las
categorías en esos archivos. Por eso:

- la lámina del ranking **no se dibuja** si el dataset tiene una sola zona, y
  explica que hace falta el archivo completo;
- las láminas de cola crónica y de brecha de plaza **sí** se muestran, con un
  aviso en la línea de lectura de que la vara es la de esa zona.

#### Corrección (2026-09-23): el pilar de la cola medía el local, no a la persona

El pilar **Cola crónica** contaba los cajeros que quedaban bajo el percentil 25
de su grupo de pares durante 6 meses o más. Al mirar quiénes eran:

**82 de los 83 crónicos (99%) trabajaban en locales cuya mediana ya estaba por
debajo de la vara de su región.** No era una lista de gente floja: era una lista
de gente que atiende en mostradores con poca cola. La vara —la mediana
regional— ignora el local, así que el local se comía la señal.

La vara correcta para hablar de una persona son **sus compañeros del mismo local
y el mismo mes**: mismo mostrador, misma demanda, mismo horario, así que ahí el
local ya no explica nada. Con esa vara:

| Umbral contra la mediana de sus compañeros | Cajeros | % de los evaluables |
|---|---:|---:|
| bajo el 60% durante 6 meses o más | **4** | 0,6% |
| bajo el 75% | 8 | 1,2% |
| bajo el 80% | 12 | 1,8% |
| bajo el 90% | 37 | 5,6% |

**En esta red no hay cola individual.** Dentro de un mismo local la gente rinde
parecido; toda la variación está entre locales. Eso corrige de paso el número
que figuraba más arriba en esta misma decisión: cuando la descomposición de
varianza decía que «el cajero explica 48,2%», ese 48,2% tenía el local adentro,
porque cada cajero trabaja casi siempre en el mismo local.

**Qué cambió:**

- El pilar **Cola sale del índice**. Se sigue calculando y se expone en
  `gestionZonal()`, pero no pondera: `CLAVES_PILAR` ya no lo incluye y
  `config.json` reparte los pesos entre rendimiento (40), cobertura (20, que
  tampoco pondera con altas inferidas) y evolución (20). Se verificó que sacarlo
  **casi no mueve el ranking**: mismo top 3, mismo fondo, cambios de ±2 puestos,
  todos dentro de las bandas de confianza. El pilar aportaba ruido.
- `gestionZonal()` expone dos cosas nuevas: `locales`, cada local contra la vara
  de su grupo de pares, y `bajoSusCompaneros`, la comparación entre compañeros
  del mismo local.
- **Se sacaron dos láminas** por pedido de la usuaria: *Los tres grupos del año*
  (un índice sin unidad, nueve columnas, y bandas que decían que el orden del
  medio no se distingue) y *La cola que se puede recuperar* (la lista
  defectuosa). También se sacó *Qué explica el movimiento* de
  `vistas-avance.js`, que repetía diez veces la misma frase y quedó duplicada
  con la línea de lectura del tablero de avance.
- **Entró** *Dónde está la diferencia*, que pone los dos números al lado:

| | Operaciones en juego | % del volumen |
|---|---:|---:|
| Entre locales (los que están bajo la vara de su grupo de pares) | 1.648.021 | **6,9%** |
| Entre personas del mismo local | 43.637 | 0,18% |

**Lo que esto no resuelve, y por qué terminó sacándose todo.** Un local por
debajo de su vara puede ser una plaza con poco movimiento o un local mal
trabajado, y con estos datos no se separa una cosa de la otra.

El 2026-09-24 se sacó también *Dónde está la diferencia*, la lámina que había
reemplazado a las dos anteriores. El motivo es el mismo que ya había aparecido
dos veces: **sin una medida del potencial de cada plaza, cualquier ranking de
locales mide cuánta gente pasa por la puerta, no cómo se trabaja.** Una lámina
que ordena 301 locales por una brecha que nadie puede atribuir no le sirve a
quien tiene que tomar una decisión, por más que el número esté bien calculado.

De toda esta línea de trabajo queda **una sola lámina**: *Dos locales, la misma
cuadra*, que compara puntos del mismo barrio y del mismo jefe zonal, donde el
potencial sí está controlado. El hallazgo de que no hay cola individual (4
cajeros de 663 bajo el 60% de sus compañeros) quedó como una línea en sus notas
del orador, que es el tamaño que le corresponde: es un motivo para **dejar de
buscar** en las personas, no un tema de reunión.

El motor conserva el índice, la cola crónica, el rendimiento por local y la
comparación entre compañeros, con sus pruebas. No se muestran en ninguna lámina,
pero son la evidencia de esta decisión y vuelven a ser útiles el día que exista
`plazas.csv`. Sigue haciendo falta la categorización de plaza de negocio
(`plazas.csv`). La única comparación donde el potencial está controlado es
*Dos locales, la misma cuadra*: mismo barrio, mismo jefe zonal.

**Cómo revertirlo:** sacar `vistas-gestion.js` de `MODULOS_JS` en
`preparar_datos.py`. El motor y el bloque `gestion_zonal` de `config.json` quedan
sin uso, pero no molestan.

### D-28 — Los rankings de cajeros se ordenan por el IP del recorte

**Decisión (2026-09-22):** en las láminas *Top cajeros del período* y *Cajeros
con menor productividad*, el IP que se muestra y con el que se ordena usa **las
operaciones que dejan los filtros activos**, dividido por los **meses activos
del cajero**, que siguen siendo los del año completo (D-02 sin cambios).

```
IP del recorte = operaciones del recorte ÷ meses activos del cajero
```

Sin filtros que recorten operaciones, da exactamente el IP de la red: es el
mismo número de siempre.

**El problema que resuelve.** La barra tiene un filtro **Grupo** (SF2 sin TEC,
TEC, Money Transfer) que aplica a todas las láminas, pero en estos dos rankings
no ordenaba nada: el orden salía del IP de red, que por diseño no se mueve con
los filtros (§4.6). Medido sobre el dato real, filtrando a TEC:

| Sin filtro | Filtrado a TEC, antes | Filtrado a TEC, ahora |
|---|---|---|
| VEULLEMENOT LEILA · 51.299 ops | VEULLEMENOT LEILA · **21 ops** | RUIZ LUCAS · 116 ops |
| MISAEL A. BULLON · 46.723 ops | MISAEL A. BULLON · **18 ops** | MAUVECIN M. VIVIANA · 93 ops |

Los mismos cajeros en el mismo orden, con la columna de operaciones vacía de
sentido: la lámina mostraba al mejor de la red con 21 operaciones de TEC,
mientras alguien con 116 no aparecía.

**El percentil también se recalcula sobre el recorte**, dentro de cada tipo de
zona. Si no, el orden *relativo* —que es el que viene por defecto— seguiría sin
moverse y el arreglo no serviría para nada.

**Lo que NO cambia, a propósito:**

- **La categoría Alta / Media / Baja sigue siendo la del año completo** y la del
  IP de red. Es el invariante de §4.6 y tiene su propia prueba
  (*«los filtros no cambian la categoría de ningún cajero»*). En el panel de
  detalle conviven los dos números cuando difieren: *IP del recorte* y
  *IP del año (define la categoría)*.
- **El motor de métricas no se tocó.** `metricasCajeros()` sigue devolviendo
  `ops` filtradas y `ip` de red; el IP del recorte se arma en la vista, que es
  donde vive la decisión de presentación.
- **La columna «Pos. red»** (cuando se mira una sola zona) sigue siendo la
  posición en el ranking de toda la red, sin filtros.

**Dónde se ve:** con cualquier filtro activo, la línea de lectura agrega «el IP
está calculado con las operaciones del recorte, no con todas las del año».

**Alcance:** solo los dos rankings de cajeros. *Mayor mejora del año* y
*Mejores y peores locales* quedan como estaban.

## 2. Contradicciones entre la skill y el requerimiento

### D-03 — Propósito: la skill dice explícitamente que no es para esto

`SKILL.md` advierte: *"No usar para dashboards de datos, tableros de KPIs ni
reportes con filtros interactivos: esta skill es para presentar contenido en
slides secuenciales, no para explorar datos."* El requerimiento pide exactamente
eso: 38 láminas con filtros globales y gráficos interactivos.

**Resolución:** se conserva de la skill todo lo que es diseño y navegación —
layout de tres franjas (header, sidebar de temario, `#slide-frame` 16:9, panel de
notas del orador a la derecha), paleta `brand`, modo proyección con `clamp()`,
contrato de funciones (`renderSlide`, `goToSlide`, `nextSlide`, `prevSlide`,
`toggleNotesPanel`, `toggleFullscreen`, `alertMessage`) y navegación por teclado
y swipe. Se **agrega** lo que la skill no contempla y el requerimiento exige: una
barra de filtros global fija bajo el header (§5), gráficos ECharts dentro de
`#slide-viewport`, panel lateral de detalle (§6) y hoja de estilos de impresión.

### D-04 — Paleta: gana el tema oscuro de la skill

`Requerimiento.md` §8 pide fondo claro con texto oscuro; la skill fija el tema
oscuro corporativo (`#07090e` + amarillo `#ffcc00`). Es una contradicción de
**diseño**, así que prima la skill: la presentación es oscura. Se conserva del
requerimiento lo que no contradice: colores fijos por categoría y por jefe zonal,
paleta apta para daltonismo, el color nunca como única señal (siempre con
etiqueta), títulos ≥ 28 px y textos de gráfico ≥ 14 px en 1920 × 1080.

### D-05 — Gráficos: ECharts en lugar de SVG animados

La skill pide SVG nativos animados; `Prompt.md` fija Apache ECharts embebido como
restricción técnica. Prima la restricción técnica del prompt (es una decisión de
datos/herramienta, no de estilo). Los gráficos se tematizan con la paleta `brand`
de la skill. Los SVG se reservan para diagramas sin datos (portada, lámina de
criterio de categorías).

### D-06 — Variante offline (Anexo A de la skill)

El requerimiento exige un único archivo que abra con doble clic sin internet, así
que se usa el Anexo A: CSS propio con la paleta y las clases de la skill (sin
Tailwind CDN), íconos SVG inline (sin FontAwesome), fuentes del sistema (sin
Google Fonts) y ECharts 5.6.0 embebido desde `vendor/echarts.min.js` (1,0 MB).
El fondo se resuelve solo con los gradientes radiales sobre `#07090e`, que la
propia skill define como fallback obligatorio cuando la imagen corporativa no
está disponible: se evita embeber un JPG de fondo para no inflar el archivo.

---

## 3. Supuestos sobre los datos reales

Todos verificados contra `consolidado_collection.csv` (44.124 filas, 310 locales,
1.076 legajos, 10 jefes zonales, períodos 202601 a 202609).

### D-07 — `localidad` se deriva del nombre del local

El dato real no tiene localidad: trae `NOM_LOCAL`, `PROVINCIA` (24 valores) y
`REGION` (6 valores: AMBA, Centro Este, Centro Oeste, Cuyo, Norte, Patagonia).
Provincia es demasiado gruesa para las láminas 10-12 y para el tipo de zona.

**Supuesto:** la localidad se deriva de `NOM_LOCAL` normalizando el prefijo
`C.S.` y los sufijos de desambiguación (números romanos, dígitos y siglas
cortas). Así `C.S. BELGRANO`, `C.S. BELGRANO II` y `C.S. BELGRANO JH` caen en la
misma localidad `BELGRANO`.

**Medido:** 316 locales quedan en **279 localidades**, o sea que solo 37 locales
comparten localidad con otro. No es un defecto de la derivación: los nombres
reales *son* barrios y ciudades (ABASTO, ADROGUÉ, ALTA GRACIA), y en la mayoría
de las localidades la red tiene un solo local. La consecuencia para las láminas
10-12 es que un ranking de localidades se parece bastante a uno de locales.

**Es una aproximación.** Se puede reemplazar sin tocar código con un archivo
opcional `data/entrada/localidades.csv` (`id_local;localidad`), que tiene
prioridad sobre la derivación. El reporte de validación lista las localidades
derivadas para poder revisarlas.

### D-08 — Altas y bajas de cajeros: se infieren del propio dataset

No hay fuente de habilitación de usuarios.

- `fecha_alta` = primer día del primer período en que el legajo registra
  operaciones.
- `fecha_baja` = vacía si el legajo operó en el último período del dataset; si
  no, último día de su último período con operaciones.

**Consecuencia:** un cajero habilitado que nunca operó es invisible en los datos
reales, así que la categoría "nunca operó" (§4.2) y su listado en la lámina 15
quedan vacíos con datos reales. Con el dataset de ejemplo sí se pueblan, porque
ahí las altas y bajas son un dato explícito. La lámina lo aclara en lugar de
mostrar una tabla vacía.

### D-09 — Un cajero puede aparecer en varios locales

466 de los 1.076 legajos operaron en más de un local durante el período, y 109
legajos aparecen con el nombre escrito de más de una forma (ya documentado en el
proyecto de origen).

- La identidad del cajero es el **legajo**, nunca el nombre.
- `nombre_cajero` = la grafía de su período más reciente.
- `id_local_actual` = el local de su período más reciente.
- Las métricas por cajero (IP, categoría, ranking) son del legajo completo,
  sumando todos sus locales. Las métricas por local suman las operaciones hechas
  en ese local, sin importar a qué local esté asignado hoy el cajero.

### D-19 — Tipo de zona de un cajero: el del local donde más operó

§4.6 compara el IP de un cajero contra los de "su mismo tipo de zona", pero un
cajero puede haber operado en locales de zonas distintas (D-09: 466 legajos
operaron en más de un local).

**Supuesto:** el tipo de zona de un cajero es el del local donde hizo **más
operaciones** dentro del período; si no operó, el de su local asignado. Se elige
el local dominante y no el asignado porque la comparación tiene que reflejar
dónde trabajó, no dónde figura.

### D-10 — Asignación de local a jefe zonal: la vigente, para todo el período

`Requerimiento.md` §10 lo propone y se confirma como supuesto: se usa la
asignación vigente en `Data/zonales/zonales.csv` para todo el año, aunque durante
el año haya habido cambios. Evita que el histórico de un jefe zonal cambie cada
vez que se reasigna un local.

### D-11 — Signo de los importes (sin efecto desde D-24)

En el dato real los retiros y pagos vienen con importe negativo y los ingresos,
positivo. Esta decisión quedó **sin efecto** cuando se sacaron los importes de la
presentación (D-24): hoy no se muestra ningún monto. Se deja anotada porque
explica por qué el importe no era un número que se pudiera sumar sin aclaraciones.

### D-12 — Último mes completo

El período por defecto (§4.1) llega hasta el último mes **completo**. Se
determina por la última fecha presente en los datos, no por el reloj: si el
dataset llega a septiembre 2026 y hoy es 21/09/2026, el default abarca 202601 a
**202608**, y 202609 queda disponible como valor del filtro.

### D-13 — No hay año anterior en el dato real

El pipeline de origen tiene piso `20260100`, así que no existe 2025. El filtro
"Comparar con año anterior" y todas las variaciones interanuales (láminas 2, 3,
12) se ocultan con datos reales y se muestran con el dataset de ejemplo, que sí
trae el año anterior completo.

### D-14 — Datos opcionales ausentes en el dato real

Se ocultan, según §3, las vistas que dependen de: coordenadas (13), hitos (4, que
igual se muestra sin marcadores), actividad horaria (21), capacitaciones (30),
textos de cierre (35 y 36) y `cantidad_rechazadas` (20). El dataset de ejemplo
incluye las seis para poder demostrarlas.

---

## 4. Decisiones de producto


**Las coordenadas no existen en ninguna fuente del circuito (buscado el
2026-09-22).** Se revisaron las 8 consultas crudas a SQL Server, los 8
consolidados, el maestro `zonales.csv`, `CONSULTAS_SQL.md`, el PRD, la
documentación y la mini app de Zonales del proyecto Dashboard Canal Propio: no
hay latitud, longitud, domicilio ni código postal en ningún eslabón. **El campo
geográfico más fino de toda la cadena es `PROVINCIA`** (24 valores), más
`REGION` (6).

Consecuencia: la lámina de mapa (§7.3) no se puede habilitar con los datos que
hay. Para prenderla hace falta traer un maestro de sucursales con domicilio de
otro sistema y geocodificarlo, y cargarlo como `latitud` y `longitud` en
`locales.csv`: la lámina aparece sola. Se evaluó reemplazarla por un mapa a
nivel provincia y no sirve — **198 de los 310 locales (64%) están en Buenos
Aires, CABA y Córdoba, que tienen 5, 5 y 2 jefes zonales**, así que a nivel
provincia el color por jefe zonal no se puede resolver justo donde está la red.
Decisión de la usuaria el 2026-09-22: **no se hace ningún mapa** hasta que haya
coordenadas reales.
### D-15 — Distribución: una sola presentación general

**Decisión de la usuaria (2026-10-05):** se reparte solo `dist/presentacion.html`,
con toda la red. Se sacó la opción `--por-jefe-zonal` de `preparar_datos.py` y
todo el código que adaptaba las láminas a un archivo de una sola zona.

Antes se recomendaba un archivo por jefe zonal para enviar fuera del equipo,
porque el completo trae datos de cajeros de toda la red. Ese riesgo baja con
`presentacion.mostrar_nombres_cajeros: false` (D-29), que muestra solo el legajo,
pero el archivo sigue trayendo los datos de toda la red adentro: conviene no
mandarlo fuera del equipo.

### D-16 — Etiquetas de los tipos de operación

Los valores crudos (`SF2 Positivo`, `Negativos`, `Envios`, `Pagos`) se muestran
con etiquetas legibles configurables en `config.json` →
`tipos_operacion.etiquetas`, sin tocar el dato. Por defecto: "SF2 Positivo",
"SF2 Negativo (retiros)", "Envíos MT", "Pagos MT". Falta confirmar los nombres
visibles con negocio (§10 del requerimiento).

### D-17 — Umbrales y parámetros, todos en `config.json`

Ningún umbral vive en el código (regla obligatoria del prompt). Incluye los siete
parámetros de §4.13 —con `minimo_meses_activos` en lugar del mínimo de días, por
D-02—, los tramos de antigüedad y de meses activos, los colores por categoría y
por jefe zonal, y los textos de portada.

### D-20 — Doble eje: se respeta el requerimiento, contra la regla general

La skill `dataviz` prohíbe el doble eje ("dos medidas de escala distinta → dos
gráficos o indexadas a una base común"). El requerimiento lo pide explícitamente
en la lámina 4 ("líneas con doble eje": operaciones y cajeros activos por mes).

**Resolución:** se usa doble eje **solo** donde la columna "Visualización" del
requerimiento lo nombra, con cada eje rotulado en el color de su serie para que
no se lea una correlación que no está medida. En cualquier otra lámina, un solo
eje; las combinaciones "barras + línea" de las láminas 17 y 20 usan la línea como
**referencia** (promedio de la red, tasa), no como segunda medida de volumen.

### D-21 — La paleta se validó con el script, no a ojo

La skill `dataviz` exige correr su validador antes de usar una paleta
categórica. Se corrió contra la superficie oscura `#0f121d`:

- **Jefes zonales (10 colores):** pasa las seis verificaciones — banda de
  luminosidad, piso de croma, separación para daltonismo (peor par ΔE 8,4),
  piso de visión normal (19,3) y contraste ≥ 3:1. Los primeros ocho son los de
  la paleta de referencia de la skill; los dos últimos se eligieron y validaron
  para completar los 10 jefes zonales que tiene la red real.
- **Categorías de productividad (3 colores):** pasa todo menos separación CVD,
  que queda en 7,6 (banda de aviso 6-8). Es **aceptable solo con codificación
  secundaria**, que acá es obligatoria por otro motivo: §8 del requerimiento ya
  exige que la categoría lleve siempre etiqueta de texto además del color.
- El amarillo de "Media" (`#c98500`) coincide con el cuarto color de jefes
  zonales. Se dejó así porque no hay ninguna lámina donde las dos escalas
  aparezcan como series del mismo gráfico.

La paleta original de la primera versión de `config.json` fallaba: todos los
colores quedaban por encima de la banda de luminosidad para fondo oscuro y el
peor par de daltonismo daba ΔE 6,6. **Si se cambia un hex, hay que volver a
correr el validador.**

### D-22 — La impresión arma las láminas fuera de pantalla

§6 pide exportar a PDF con una lámina por página. ECharts no puede medir un
contenedor con `display:none`, así que `#print-root` se posiciona fuera de la
pantalla (`left:-100000px`) en vez de ocultarse: se renderizan las 38 láminas
ahí, se llama a `print()` y después se sueltan esas instancias. Los filtros
activos van impresos en el encabezado de cada hoja.

### D-23 — Un `<script>` por módulo en el HTML final

Todos los módulos concatenados en un solo `<script>` significaban que un error
de sintaxis en cualquiera dejaba la presentación en blanco. Cada módulo va en su
propio bloque con `data-modulo`, así una lámina rota se lleva puesta solo a su
sección.

### D-18 — Privacidad

Sin servicios externos, sin telemetría, sin logs con datos de cajeros. El reporte
de validación (`dist/validacion.txt`) referencia **IDs**, nunca nombres. Los
archivos reales viven en `data/entrada/`, excluida del control de versiones.

### D-29 — Modo reunión: sin filtros, sin barras de desplazamiento, una sola presentación

**Decisión de la usuaria (2026-10-05).** La presentación es para proyectar en la
reunión, no para explorar datos:

- **Sin filtros.** No hay barra de filtros ni clics que filtren desde un gráfico;
  todo se muestra con el estado inicial (año completo, toda la red). Esto deja
  sin efecto la parte interactiva de §5 del requerimiento y de D-28.
- **Sin barras de desplazamiento.** Ningún elemento muestra barra de scroll
  (`estilos.css`, bloque *scrollbars*). Las láminas, tablas y paneles recortan
  lo que no entra; las notas del orador se pueden seguir desplazando con la
  rueda, sin barra. Los botones que alternaban vistas quedan ocultos.
- **Guion fijo.** Las láminas que se presentan y su orden están en
  `config.json` → `presentacion.laminas` (14 láminas). `filas_ranking` fija
  cuántas filas entran por lista y `mostrar_nombres_cajeros` en `false` muestra
  solo el legajo.
- **Excepción: tipo de operación.** Por pedido posterior de la usuaria hay
  botones dentro de la lámina, en su esquina superior derecha (visibles en pantalla completa), (Todos, SF2 sin TEC, MT, TEC) que filtran
  todas las láminas por grupo (`Filtros.estado.grupos`). Es el único control.
- **Una sola presentación general** (D-15): no hay archivos por jefe zonal.
- **Cierre rediseñado (2026-10-05).** *Hallazgos por zona* es una tabla con
  todas las zonas (operaciones, variación, avance, % en alta, operadores/mes) y
  debajo los textos de `textos_cierre`. *Decisiones y próximos pasos* muestra los
  cuatro números del año y los objetivos de la red y de cada zona. Se sacó la
  tabla vacía de acuerdos. Lo que no entra en pantallas chicas se oculta entero,
  sin quedar cortado (`UI.recortarHijos`).
- **Rankings con donas (2026-10-05).** Las láminas de mejores y peores cajeros
  y locales vuelven a mostrar de qué jefe zonal es cada punta del ranking.

La versión interactiva anterior, con filtros, quedó en
`respaldo_version_interactiva/` y no se modificó.
