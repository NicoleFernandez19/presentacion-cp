"""Prepara la presentación: lee los datos, los valida, arma el JSON columnar y
escribe dist/presentacion.html con todo embebido (estilos, scripts, ECharts).

    python scripts/preparar_datos.py --ejemplo
    python scripts/preparar_datos.py
    python scripts/preparar_datos.py --por-jefe-zonal

Los datos reales nunca salen del equipo: no hay red, ni telemetría, ni nombres
de cajeros en el reporte de validación.
"""

from __future__ import annotations

import argparse
import calendar
import json
import re
import sys
import unicodedata
from datetime import date, datetime
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "src"
DIST = RAIZ / "dist"
VENDOR = RAIZ / "vendor"

# Orden de inyección: importa, cada módulo usa los anteriores.
MODULOS_JS = [
    "formato.js",
    "metricas.js",
    "datos.js",
    "graficos.js",
    "filtros.js",
    "navegacion.js",
    "vistas-resumen.js",
    "vistas-estructura.js",
    "vistas-actividad.js",
    "vistas-productividad.js",
    "vistas-rankings.js",
    "vistas-avance.js",
    "vistas-gestion.js",
    "vistas-cierre.js",
    "vistas-reunion.js",
    "vistas-anexo.js",
    "app.js",
]

TABLAS = {
    "transacciones_mensuales": True,
    "actividad_mensual": False,
    "cajeros": True,
    "locales": True,
    "hitos": False,
    "actividad_horaria": False,
    "capacitaciones": False,
    "textos_cierre": False,
    "localidades": False,
    "plazas": False,
}


class Reporte:
    """Junta los hallazgos de validación y los escribe en dist/validacion.txt."""

    def __init__(self) -> None:
        self.bloques: list[tuple[str, list[str]]] = []
        self.errores = 0
        self.avisos = 0

    def agregar(
        self, titulo: str, lineas: list[str], es_error: bool = False, informativo: bool = False
    ) -> None:
        """informativo: el bloque se imprime pero no cuenta como error ni como aviso."""
        self.bloques.append((titulo, lineas))
        if lineas and not informativo:
            if es_error:
                self.errores += len(lineas)
            else:
                self.avisos += len(lineas)

    def escribir(self, destino: Path, resumen: list[str]) -> None:
        partes = [
            "REPORTE DE VALIDACIÓN — Presentación anual de la red",
            f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}",
            "",
            "RESUMEN",
            *[f"  {linea}" for linea in resumen],
            "",
            f"  Errores: {self.errores}   Avisos: {self.avisos}",
            "",
        ]
        for titulo, lineas in self.bloques:
            partes.append(titulo)
            if not lineas:
                partes.append("  Sin hallazgos.")
            else:
                partes.extend(f"  {linea}" for linea in lineas)
            partes.append("")
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text("\n".join(partes), encoding="utf-8")


# ----------------------------------------------------------------- lectura


def leer_tabla(carpeta: Path, nombre: str, separador: str) -> pd.DataFrame | None:
    for extension in (".csv", ".xlsx", ".xls"):
        ruta = carpeta / f"{nombre}{extension}"
        if not ruta.exists():
            continue
        if extension == ".csv":
            df = pd.read_csv(ruta, sep=separador, encoding="utf-8-sig", dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(ruta, dtype=str).fillna("")
        df.columns = [str(c).strip().lower() for c in df.columns]
        return df
    return None


def a_entero(serie: pd.Series) -> pd.Series:
    return pd.to_numeric(serie.replace("", None), errors="coerce").astype("Float64")


def a_fecha(valor: str) -> int:
    """dd/mm/aaaa o aaaa-mm-dd -> aaaammdd. 0 si está vacío o no se entiende."""
    texto = (valor or "").strip()
    if not texto:
        return 0
    for formato in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return int(datetime.strptime(texto, formato).strftime("%Y%m%d"))
        except ValueError:
            continue
    return 0


def normalizar_localidad(nombre: str, config: dict) -> str:
    """Deriva la localidad del nombre del local (D-07)."""
    texto = (nombre or "").strip().upper()
    for prefijo in config["datos"]["prefijos_local_a_quitar"]:
        if texto.startswith(prefijo.upper()):
            texto = texto[len(prefijo) :].strip()
    partes = texto.split()
    sufijos = {s.upper() for s in config["datos"]["sufijos_local_a_quitar"]}
    while partes and (partes[-1] in sufijos or partes[-1].isdigit()):
        partes.pop()
    return " ".join(partes) if partes else texto


def sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


# -------------------------------------------------------------- validación


def validar(tablas: dict[str, pd.DataFrame], config: dict, reporte: Reporte) -> None:
    tx = tablas["transacciones_mensuales"]
    cajeros = tablas["cajeros"]
    locales = tablas["locales"]

    ids_cajero = set(cajeros["id_cajero"])
    ids_local = set(locales["id_local"])

    huerfanos_cajero = sorted(set(tx["id_cajero"]) - ids_cajero)
    huerfanos_local = sorted(set(tx["id_local"]) - ids_local)
    lineas_ids = (
        [f"id_cajero «{v}» aparece en transacciones y no está en cajeros" for v in huerfanos_cajero[:30]]
        + ([f"... y {len(huerfanos_cajero) - 30} cajeros más"] if len(huerfanos_cajero) > 30 else [])
        + [f"id_local «{v}» aparece en transacciones y no está en locales" for v in huerfanos_local[:30]]
        + ([f"... y {len(huerfanos_local) - 30} locales más"] if len(huerfanos_local) > 30 else [])
        + [
            f"id_local_actual «{v}» de cajeros no está en locales"
            for v in sorted(set(cajeros["id_local_actual"]) - ids_local - {""})[:30]
        ]
    )
    if "plazas" in tablas:
        huerfanas_plaza = sorted(set(tablas["plazas"]["id_local"]) - ids_local)
        lineas_ids += [
            f"id_local «{v}» de plazas no está en locales" for v in huerfanas_plaza[:30]
        ]
    reporte.agregar("1. IDs sin correspondencia en los maestros", lineas_ids, es_error=True)

    clave = ["anio", "mes", "id_cajero", "id_local", "tipo_operacion"]
    if "grupo" in tx:
        clave.insert(4, "grupo")
    duplicadas = tx[tx.duplicated(subset=clave, keep=False)]
    lineas_dup = []
    if not duplicadas.empty:
        agrupadas = duplicadas.groupby(clave).size().reset_index(name="repeticiones")
        for _, fila in agrupadas.head(30).iterrows():
            lineas_dup.append(
                f"{fila['anio']}-{fila['mes']} cajero {fila['id_cajero']} local {fila['id_local']} "
                f"{fila.get('grupo', '')} tipo «{fila['tipo_operacion']}»: {fila['repeticiones']} filas"
            )
        if len(agrupadas) > 30:
            lineas_dup.append(f"... y {len(agrupadas) - 30} combinaciones más")
    dup_actividad = []
    if "actividad_mensual" in tablas:
        act = tablas["actividad_mensual"]
        rep = act[act.duplicated(subset=["anio", "mes", "id_cajero"], keep=False)]
        if not rep.empty:
            dup_actividad = [
                f"actividad_mensual: {len(rep)} filas duplicadas por anio+mes+id_cajero"
            ]
    reporte.agregar("2. Filas duplicadas", lineas_dup + dup_actividad, es_error=True)

    periodos = sorted({int(a) * 100 + int(m) for a, m in zip(tx["anio_n"], tx["mes_n"])})
    faltantes = []
    if periodos:
        p = periodos[0]
        fin = periodos[-1]
        presentes = set(periodos)
        while p <= fin:
            if p not in presentes:
                faltantes.append(f"{p // 100}-{p % 100:02d} sin ninguna transacción")
            p = p + 1 if p % 100 < 12 else (p // 100 + 1) * 100 + 1
    reporte.agregar("3. Meses faltantes en la serie", faltantes)

    conocidos = set(config["tipos_operacion"]["orden"]) | set(config["tipos_operacion"]["etiquetas"])
    desconocidos = sorted(set(tx["tipo_operacion"]) - conocidos)
    grupos_conocidos = set(config["grupos"]["orden"]) | set(config["grupos"]["etiquetas"])
    grupos_desconocidos = sorted(set(tx["grupo"]) - grupos_conocidos) if "grupo" in tx else []
    reporte.agregar(
        "4. Tipos de operación y grupos no reconocidos",
        [
            f"«{v}»: {int((tx['tipo_operacion'] == v).sum())} filas — tipo de operación que no está en config.json"
            for v in desconocidos
        ]
        + [
            f"«{v}»: {int((tx['grupo'] == v).sum())} filas — grupo que no está en config.json"
            for v in grupos_desconocidos
        ],
        es_error=True,
    )

    negativos = []
    neg_cant = tx[tx["cantidad_n"] < 0]
    if not neg_cant.empty:
        negativos.append(f"cantidad negativa en {len(neg_cant)} filas de transacciones")
        for _, fila in neg_cant.head(10).iterrows():
            negativos.append(
                f"  {int(fila['anio_n'])}-{int(fila['mes_n']):02d} cajero {fila['id_cajero']} "
                f"local {fila['id_local']}: cantidad {fila['cantidad_n']}"
            )
    if "rechazadas_n" in tx and (tx["rechazadas_n"] < 0).any():
        negativos.append(f"cantidad_rechazadas negativa en {int((tx['rechazadas_n'] < 0).sum())} filas")
    if "actividad_mensual" in tablas and (tablas["actividad_mensual"]["dias_n"] < 0).any():
        negativos.append(
            f"dias_activos negativo en {int((tablas['actividad_mensual']['dias_n'] < 0).sum())} filas"
        )
    reporte.agregar("5. Valores negativos", negativos, es_error=True)

    excedidos = []
    if "actividad_mensual" in tablas:
        act = tablas["actividad_mensual"].copy()
        act["dias_del_mes"] = [
            calendar.monthrange(int(a), int(m))[1] for a, m in zip(act["anio_n"], act["mes_n"])
        ]
        malas = act[act["dias_n"] > act["dias_del_mes"]]
        for _, fila in malas.head(30).iterrows():
            excedidos.append(
                f"{int(fila['anio_n'])}-{int(fila['mes_n']):02d} cajero {fila['id_cajero']}: "
                f"{int(fila['dias_n'])} días activos sobre {int(fila['dias_del_mes'])} del mes"
            )
        if len(malas) > 30:
            excedidos.append(f"... y {len(malas) - 30} filas más")
    reporte.agregar("6. Días activos mayores a los días del mes", excedidos, es_error=True)

    # Avisos que no invalidan, pero conviene mirar.
    avisos = []
    sin_ops = ids_cajero - set(tx["id_cajero"])
    if sin_ops:
        avisos.append(f"{len(sin_ops)} cajeros habilitados sin ninguna operación en el período")
    locales_sin_ops = ids_local - set(tx["id_local"])
    if locales_sin_ops:
        avisos.append(f"{len(locales_sin_ops)} locales sin ninguna operación en el período")
    sin_coordenadas = int(((locales.get("latitud", pd.Series(dtype=str)) == "").sum())) if "latitud" in locales else len(locales)
    if sin_coordenadas:
        avisos.append(f"{sin_coordenadas} locales sin coordenadas (la lámina de mapa los omite)")
    reporte.agregar("7. Avisos", avisos)


# ------------------------------------------------------------- construcción


def construir_datos(tablas: dict[str, pd.DataFrame], config: dict, origen: str) -> dict:
    tx = tablas["transacciones_mensuales"]
    cajeros = tablas["cajeros"].copy()
    locales = tablas["locales"].copy()

    # --- localidades
    if "localidades" in tablas:
        mapa = dict(zip(tablas["localidades"]["id_local"], tablas["localidades"]["localidad"]))
        locales["localidad"] = [
            mapa.get(i, locales.loc[j, "localidad"] if "localidad" in locales else "")
            for j, i in enumerate(locales["id_local"])
        ]
    if "localidad" not in locales or (locales["localidad"] == "").all():
        locales["localidad"] = [normalizar_localidad(n, config) for n in locales["nombre_local"]]
    locales["localidad"] = [
        loc if loc.strip() else normalizar_localidad(nom, config)
        for loc, nom in zip(locales["localidad"], locales["nombre_local"])
    ]

    # --- dimensiones
    jefes = sorted({j.strip() for j in locales["jefe_zonal"] if j.strip()} or {"Sin asignar"})
    localidades = sorted({l for l in locales["localidad"]})
    provincias = sorted({p.strip() for p in locales.get("provincia", pd.Series([""] * len(locales)))})
    tipos_orden = config["tipos_operacion"]["orden"]
    tipos = [t for t in tipos_orden if t in set(tx["tipo_operacion"])]
    tipos += sorted(set(tx["tipo_operacion"]) - set(tipos))

    # Grupo (D-01): SF2 sin TEC / TEC / MT. Si el dato no lo trae, todo cae en uno solo.
    if "grupo" in tx and (tx["grupo"].str.strip() != "").any():
        presentes = set(tx["grupo"])
        grupos = [g for g in config["grupos"]["orden"] if g in presentes]
        grupos += sorted(presentes - set(grupos))
    else:
        grupos = ["Todas las operaciones"]
        tx = tx.assign(grupo=grupos[0])
    idx_grupo = {v: i for i, v in enumerate(grupos)}

    idx_jefe = {v: i for i, v in enumerate(jefes)}
    idx_localidad = {v: i for i, v in enumerate(localidades)}
    idx_provincia = {v: i for i, v in enumerate(provincias)}
    idx_tipo = {v: i for i, v in enumerate(tipos)}
    idx_local = {v: i for i, v in enumerate(locales["id_local"])}
    idx_cajero = {v: i for i, v in enumerate(cajeros["id_cajero"])}

    # --- tipo de zona (§4.5): del dato si viene, calculado si no
    if "tipo_zona" in locales and (locales["tipo_zona"].str.strip() != "").any():
        zona_por_local = [
            0 if sin_acentos(v).strip().upper().startswith("ALTO") else 1 for v in locales["tipo_zona"]
        ]
        zona_calculada = False
    else:
        ops_por_localidad: dict[str, float] = {}
        for id_local, cantidad in zip(tx["id_local"], tx["cantidad_n"]):
            j = idx_local.get(id_local)
            if j is None:
                continue
            loc = locales.loc[j, "localidad"]
            ops_por_localidad[loc] = ops_por_localidad.get(loc, 0) + float(cantidad)
        ordenadas = sorted(ops_por_localidad, key=lambda k: -ops_por_localidad[k])
        corte = max(1, round(len(ordenadas) * config["tipo_zona"]["porcentaje_localidades_alto_movimiento"] / 100))
        altas = set(ordenadas[:corte])
        zona_por_local = [0 if loc in altas else 1 for loc in locales["localidad"]]
        zona_calculada = True

    # --- grupo de pares (D-27): agrupación EXÓGENA de locales que sirve de vara.
    # A diferencia del tipo de zona, no puede salir del volumen: si el grupo se
    # define con el resultado, un local flojo se compara contra otros flojos y el
    # criterio absuelve justo lo que tiene que detectar.
    # Prioridad: plazas.csv (definición de negocio) > región > provincia > red.
    conf_pares = config.get("gestion_zonal", {}).get("grupo_pares", {})
    etiqueta_resto = conf_pares.get("etiqueta_resto", "Resto de la red")
    minimo_pares = int(conf_pares.get("minimo_cajero_mes", 200))
    if "plazas" in tablas:
        mapa_plaza = dict(zip(tablas["plazas"]["id_local"], tablas["plazas"]["plaza"]))
        crudo_plaza = [str(mapa_plaza.get(i, "")).strip() for i in locales["id_local"]]
        origen_pares = "plazas.csv"
    elif "region" in locales and (locales["region"].str.strip() != "").any():
        crudo_plaza = [str(v).strip() for v in locales["region"]]
        origen_pares = "columna «region» de locales"
    elif "provincia" in locales and (locales["provincia"].str.strip() != "").any():
        crudo_plaza = [str(v).strip() for v in locales["provincia"]]
        origen_pares = "provincia"
    else:
        crudo_plaza = ["" for _ in locales["id_local"]]
        origen_pares = "toda la red en un solo grupo"
    crudo_plaza = [v if v else etiqueta_resto for v in crudo_plaza]
    plaza_de_local = dict(zip(locales["id_local"], crudo_plaza))

    # Cajero-mes por grupo candidato, con el cajero contado una sola vez en el
    # local donde más operó ese mes (mismo criterio que D-19). Los grupos que no
    # llegan al mínimo se funden: una mediana apoyada en cuatro observaciones no
    # es una vara.
    tx_pos = tx[tx["cantidad_n"] > 0]
    dominante = (
        tx_pos.groupby(["id_cajero", "anio_n", "mes_n", "id_local"], as_index=False)["cantidad_n"]
        .sum()
        .sort_values("cantidad_n")
        .groupby(["id_cajero", "anio_n", "mes_n"], as_index=False)
        .tail(1)
    )
    conteo_pares = (
        pd.Series([plaza_de_local.get(i, etiqueta_resto) for i in dominante["id_local"]])
        .value_counts()
        .to_dict()
    )
    fundidos = sorted(p for p, n in conteo_pares.items() if n < minimo_pares)
    sin_datos = sorted(set(crudo_plaza) - set(conteo_pares))
    a_fundir = set(fundidos) | set(sin_datos)
    plaza_final = [etiqueta_resto if v in a_fundir else v for v in crudo_plaza]
    plaza_de_local = dict(zip(locales["id_local"], plaza_final))
    conteo_pares = (
        pd.Series([plaza_de_local.get(i, etiqueta_resto) for i in dominante["id_local"]])
        .value_counts()
        .to_dict()
    )
    plazas = sorted(set(plaza_final))
    idx_plaza = {v: i for i, v in enumerate(plazas)}
    plaza_por_local = [idx_plaza[v] for v in plaza_final]

    # --- períodos y corte (D-12)
    periodos = sorted({int(a) * 100 + int(m) for a, m in zip(tx["anio_n"], tx["mes_n"])})
    hoy = date.today()
    completos = [
        p
        for p in periodos
        if date(p // 100, p % 100, calendar.monthrange(p // 100, p % 100)[1]) < hoy
    ]
    periodo_corte = completos[-1] if completos else periodos[-1]
    anio_actual = periodo_corte // 100
    anio_anterior = anio_actual - 1 if any(p // 100 == anio_actual - 1 for p in periodos) else None
    fin_corte = date(periodo_corte // 100, periodo_corte % 100, calendar.monthrange(periodo_corte // 100, periodo_corte % 100)[1])

    # --- transacciones (solo cantidades: la presentación no habla de importes)
    fila_periodo, fila_cajero, fila_local, fila_grupo, fila_tipo, fila_cant = [], [], [], [], [], []
    fila_rech = []
    tiene_rech = "rechazadas_n" in tx
    for anio, mes, cajero, local, grupo, tipo, cantidad, rech in zip(
        tx["anio_n"],
        tx["mes_n"],
        tx["id_cajero"],
        tx["id_local"],
        tx["grupo"],
        tx["tipo_operacion"],
        tx["cantidad_n"],
        tx["rechazadas_n"] if tiene_rech else [0] * len(tx),
    ):
        ic = idx_cajero.get(cajero)
        il = idx_local.get(local)
        if ic is None or il is None:
            continue  # ya reportado como huérfano
        fila_periodo.append(int(anio) * 100 + int(mes))
        fila_cajero.append(ic)
        fila_local.append(il)
        fila_grupo.append(idx_grupo[grupo])
        fila_tipo.append(idx_tipo[tipo])
        fila_cant.append(int(cantidad))
        if tiene_rech:
            fila_rech.append(int(rech))

    # --- cajeros: local actual y grafía del período más reciente (D-09)
    ultimo_local: dict[int, tuple[int, int]] = {}
    actividad_por_cajero: dict[int, list[int]] = {}
    for p, c, l in zip(fila_periodo, fila_cajero, fila_local):
        actual = ultimo_local.get(c)
        if actual is None or p > actual[0]:
            ultimo_local[c] = (p, l)
        rango = actividad_por_cajero.get(c)
        if rango is None:
            actividad_por_cajero[c] = [p, p]
        else:
            rango[0] = min(rango[0], p)
            rango[1] = max(rango[1], p)

    cajero_local = []
    for i, valor in enumerate(cajeros["id_local_actual"]):
        if i in ultimo_local:
            cajero_local.append(ultimo_local[i][1])
        else:
            cajero_local.append(idx_local.get(valor, -1))

    # ¿Las altas y bajas son un dato propio o están inferidas de la actividad?
    # Si para casi todos el alta cae en su primer mes con operaciones y la baja en
    # el último, no hay padrón de usuarios detrás: la "dotación habilitada" sería
    # un número circular y las láminas tienen que decirlo (D-26).
    coinciden = 0
    evaluados = 0
    for i, valor in enumerate(cajeros["id_cajero"]):
        rango = actividad_por_cajero.get(i)
        if not rango:
            continue
        evaluados += 1
        alta = a_fecha(cajeros["fecha_alta"].iloc[i]) if "fecha_alta" in cajeros else 0
        baja = a_fecha(cajeros["fecha_baja"].iloc[i]) if "fecha_baja" in cajeros else 0
        alta_ok = alta and alta // 100 == rango[0]
        baja_ok = (not baja) or baja // 100 == rango[1]
        if alta_ok and baja_ok:
            coinciden += 1
    altas_inferidas = evaluados > 0 and coinciden / evaluados >= 0.9

    # --- opcionales
    actividad = None
    if "actividad_mensual" in tablas:
        act = tablas["actividad_mensual"]
        ap, ac, ad = [], [], []
        for anio, mes, cajero, dias in zip(act["anio_n"], act["mes_n"], act["id_cajero"], act["dias_n"]):
            ic = idx_cajero.get(cajero)
            if ic is None:
                continue
            ap.append(int(anio) * 100 + int(mes))
            ac.append(ic)
            ad.append(int(dias))
        actividad = {"periodo": ap, "cajero": ac, "dias": ad}

    hitos = None
    if "hitos" in tablas:
        hitos = [
            {
                "fecha": a_fecha(f["fecha"]),
                "titulo": f["titulo"],
                "descripcion": f.get("descripcion", ""),
                "jefe": idx_jefe.get(f.get("jefe_zonal", "").strip(), -1),
            }
            for _, f in tablas["hitos"].iterrows()
        ]

    horaria = None
    if "actividad_horaria" in tablas:
        h = tablas["actividad_horaria"]
        hp, hl, hd, hh, hc = [], [], [], [], []
        for anio, mes, local, dia, hora, cantidad in zip(
            h["anio_n"], h["mes_n"], h["id_local"], h["dia_n"], h["hora_n"], h["cantidad_n"]
        ):
            il = idx_local.get(local)
            if il is None:
                continue
            hp.append(int(anio) * 100 + int(mes))
            hl.append(il)
            hd.append(int(dia))
            hh.append(int(hora))
            hc.append(int(cantidad))
        horaria = {"periodo": hp, "local": hl, "dia": hd, "hora": hh, "cantidad": hc}

    capacitaciones = None
    if "capacitaciones" in tablas:
        capacitaciones = [
            {
                "cajero": idx_cajero.get(f["id_cajero"], -1),
                "fecha": a_fecha(f["fecha"]),
                "nombre": f["nombre_capacitacion"],
            }
            for _, f in tablas["capacitaciones"].iterrows()
            if f["id_cajero"] in idx_cajero
        ]

    textos = None
    if "textos_cierre" in tablas:
        textos = [
            {
                "jefe": idx_jefe.get(f.get("jefe_zonal", "").strip(), -1),
                "hallazgos": f.get("hallazgos", ""),
                "objetivos": f.get("objetivos", ""),
            }
            for _, f in tablas["textos_cierre"].iterrows()
        ]

    def columna(df: pd.DataFrame, nombre: str, defecto=""):
        return list(df[nombre]) if nombre in df else [defecto] * len(df)

    datos = {
        "meta": {
            "generado": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "origen": origen,
            "periodos": periodos,
            "periodo_corte": periodo_corte,
            "fecha_corte": fin_corte.strftime("%d/%m/%Y"),
            "anio_actual": anio_actual,
            "anio_anterior": anio_anterior,
            "zona_calculada": zona_calculada,
            "pares": {
                "origen": origen_pares,
                "minimo_cajero_mes": minimo_pares,
                "conteo": conteo_pares,
                "fundidos": fundidos + sin_datos,
                "grupos": plazas,
            },
            "altas_inferidas": altas_inferidas,
            "opcionales": {
                "rechazos": tiene_rech,
                "dias_activos": actividad is not None,
                "hitos": hitos is not None,
                "horaria": horaria is not None,
                "capacitaciones": capacitaciones is not None,
                "textos": textos is not None,
                "coordenadas": any(str(v).strip() not in ("", "nan") for v in columna(locales, "latitud")),
                "anio_anterior": anio_anterior is not None,
            },
            "filas": {
                "transacciones": len(fila_periodo),
                "cajeros": len(cajeros),
                "locales": len(locales),
            },
        },
        "config": config,
        "dim": {
            "jefes": jefes,
            "localidades": localidades,
            "provincias": provincias,
            "tiposZona": [config["tipo_zona"]["etiquetas"]["alto"], config["tipo_zona"]["etiquetas"]["bajo"]],
            "plazas": plazas,
            "grupos": grupos,
            "tiposOperacion": tipos,
            "locales": {
                "id": list(locales["id_local"]),
                "nombre": list(locales["nombre_local"]),
                "localidad": [idx_localidad[v] for v in locales["localidad"]],
                "provincia": [idx_provincia.get(str(v).strip(), -1) for v in columna(locales, "provincia")],
                "jefe": [idx_jefe.get(str(v).strip(), -1) for v in locales["jefe_zonal"]],
                "tipo_zona": zona_por_local,
                "plaza": plaza_por_local,
                "lat": [float(v) if str(v).strip() not in ("", "nan") else None for v in columna(locales, "latitud")],
                "lon": [float(v) if str(v).strip() not in ("", "nan") else None for v in columna(locales, "longitud")],
                "apertura": [a_fecha(v) for v in columna(locales, "fecha_apertura")],
                "cierre": [a_fecha(v) for v in columna(locales, "fecha_cierre")],
            },
            "cajeros": {
                "id": list(cajeros["id_cajero"]),
                "nombre": list(cajeros["nombre_cajero"]),
                "local_actual": cajero_local,
                "alta": [a_fecha(v) for v in columna(cajeros, "fecha_alta")],
                "baja": [a_fecha(v) for v in columna(cajeros, "fecha_baja")],
            },
        },
        "tx": {
            "periodo": fila_periodo,
            "cajero": fila_cajero,
            "local": fila_local,
            "grupo": fila_grupo,
            "tipo": fila_tipo,
            "cantidad": fila_cant,
            "rechazadas": fila_rech if tiene_rech else None,
        },
        "actividad": actividad,
        "hitos": hitos,
        "horaria": horaria,
        "capacitaciones": capacitaciones,
        "textos": textos,
    }
    return datos


def recortar_por_jefe(datos: dict, jefe_idx: int) -> dict:
    """Copia del dataset con solo los locales, cajeros y filas de un jefe zonal."""
    import copy

    d = copy.deepcopy(datos)
    locales = d["dim"]["locales"]
    conservar_local = {i for i, j in enumerate(locales["jefe"]) if j == jefe_idx}

    filas = [i for i, l in enumerate(d["tx"]["local"]) if l in conservar_local]
    for campo in ("periodo", "cajero", "local", "grupo", "tipo", "cantidad", "rechazadas"):
        if d["tx"].get(campo) is not None:
            d["tx"][campo] = [d["tx"][campo][i] for i in filas]

    cajeros_visibles = set(d["tx"]["cajero"])
    for i, l in enumerate(d["dim"]["cajeros"]["local_actual"]):
        if l in conservar_local:
            cajeros_visibles.add(i)

    if d.get("actividad"):
        idx = [i for i, c in enumerate(d["actividad"]["cajero"]) if c in cajeros_visibles]
        for campo in ("periodo", "cajero", "dias"):
            d["actividad"][campo] = [d["actividad"][campo][i] for i in idx]
    if d.get("horaria"):
        idx = [i for i, l in enumerate(d["horaria"]["local"]) if l in conservar_local]
        for campo in ("periodo", "local", "dia", "hora", "cantidad"):
            d["horaria"][campo] = [d["horaria"][campo][i] for i in idx]
    if d.get("capacitaciones"):
        d["capacitaciones"] = [c for c in d["capacitaciones"] if c["cajero"] in cajeros_visibles]
    if d.get("hitos"):
        d["hitos"] = [h for h in d["hitos"] if h["jefe"] in (-1, jefe_idx)]
    if d.get("textos"):
        d["textos"] = [t for t in d["textos"] if t["jefe"] in (-1, jefe_idx)]

    # Los cajeros y locales de otras zonas se vacían en lugar de reindexarse:
    # así los índices de tx siguen siendo válidos y no queda ningún dato nominal ajeno.
    for i in range(len(d["dim"]["cajeros"]["id"])):
        if i not in cajeros_visibles:
            d["dim"]["cajeros"]["id"][i] = ""
            d["dim"]["cajeros"]["nombre"][i] = ""
            d["dim"]["cajeros"]["local_actual"][i] = -1
            d["dim"]["cajeros"]["alta"][i] = 0
            d["dim"]["cajeros"]["baja"][i] = 0
    for i in range(len(locales["id"])):
        if i not in conservar_local:
            locales["id"][i] = ""
            locales["nombre"][i] = ""
            locales["jefe"][i] = -1

    d["meta"]["jefe_zonal"] = d["dim"]["jefes"][jefe_idx]
    d["meta"]["filas"]["transacciones"] = len(d["tx"]["periodo"])
    return d


# ------------------------------------------------------------------ salida


def json_embebido(datos: dict) -> str:
    texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return texto.replace("</", "<\\/")


def construir_html(datos: dict, config: dict) -> str:
    plantilla = (SRC / "plantilla.html").read_text(encoding="utf-8")
    estilos = (SRC / "estilos.css").read_text(encoding="utf-8")
    echarts = (VENDOR / "echarts.min.js").read_text(encoding="utf-8")

    presentes = {p.name for p in (SRC / "js").glob("*.js")}
    faltan = presentes - set(MODULOS_JS)
    if faltan:
        raise SystemExit(
            f"Hay módulos en src/js que no están en MODULOS_JS y no se inyectarían: {sorted(faltan)}"
        )
    faltantes = [n for n in MODULOS_JS if not (SRC / "js" / n).exists()]
    if faltantes:
        print(f"AVISO: módulos todavía no escritos, se omiten: {faltantes}")
    # Un <script> por módulo: si uno tiene un error de sintaxis, el resto sigue vivo.
    scripts = "\n".join(
        f'<script data-modulo="{nombre}">\n' + (SRC / "js" / nombre).read_text(encoding="utf-8") + "\n</script>"
        for nombre in MODULOS_JS
        if nombre not in faltantes
    )

    titulo = config["presentacion"]["titulo"]
    if datos["meta"].get("jefe_zonal"):
        titulo = f"{titulo} — {datos['meta']['jefe_zonal']}"

    html = plantilla
    html = html.replace("{{TITULO}}", titulo)
    html = html.replace("{{SUBTITULO}}", config["presentacion"]["subtitulo"])
    html = html.replace("{{PRESENTADOR}}", config["presentacion"]["presentador"])
    html = html.replace("{{AREA}}", config["presentacion"]["area"])
    html = html.replace("/*{{ESTILOS}}*/", estilos)
    html = html.replace("/*{{VENDOR}}*/", echarts)
    html = html.replace("/*{{DATOS}}*/", "window.DATOS=" + json_embebido(datos) + ";")
    html = html.replace("<!--{{SCRIPTS}}-->", scripts)
    return html


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera la presentación anual de la red.")
    parser.add_argument("--ejemplo", action="store_true", help="usa data/ejemplo en vez de data/entrada")
    parser.add_argument("--carpeta", type=str, default=None, help="carpeta de datos alternativa")
    parser.add_argument("--por-jefe-zonal", action="store_true", help="genera además un archivo por jefe zonal")
    parser.add_argument("--salida", type=str, default=None, help="ruta del HTML de salida")
    argumentos = parser.parse_args()

    config = json.loads((RAIZ / "config.json").read_text(encoding="utf-8"))
    separador = config["datos"]["separador_csv"]

    if argumentos.carpeta:
        carpeta = Path(argumentos.carpeta)
    else:
        carpeta = RAIZ / ("data/ejemplo" if argumentos.ejemplo else "data/entrada")
    if not carpeta.exists():
        raise SystemExit(f"No existe la carpeta de datos: {carpeta}")

    tablas: dict[str, pd.DataFrame] = {}
    for nombre, obligatoria in TABLAS.items():
        df = leer_tabla(carpeta, nombre, separador)
        if df is None:
            if obligatoria:
                raise SystemExit(f"Falta la tabla obligatoria «{nombre}» en {carpeta}")
            continue
        tablas[nombre] = df

    # columnas numéricas auxiliares
    tx = tablas["transacciones_mensuales"]
    tx["anio_n"] = a_entero(tx["anio"])
    tx["mes_n"] = a_entero(tx["mes"])
    tx["cantidad_n"] = a_entero(tx["cantidad"]).fillna(0)
    if "cantidad_rechazadas" in tx and (tx["cantidad_rechazadas"] != "").any():
        tx["rechazadas_n"] = a_entero(tx["cantidad_rechazadas"]).fillna(0)
    if "actividad_mensual" in tablas:
        act = tablas["actividad_mensual"]
        act["anio_n"] = a_entero(act["anio"])
        act["mes_n"] = a_entero(act["mes"])
        act["dias_n"] = a_entero(act["dias_activos"]).fillna(0)
    if "actividad_horaria" in tablas:
        h = tablas["actividad_horaria"]
        h["anio_n"] = a_entero(h["anio"])
        h["mes_n"] = a_entero(h["mes"])
        h["dia_n"] = a_entero(h["dia_semana"]).fillna(0)
        h["hora_n"] = a_entero(h["hora"]).fillna(0)
        h["cantidad_n"] = a_entero(h["cantidad"]).fillna(0)

    reporte = Reporte()
    validar(tablas, config, reporte)

    origen = "ejemplo" if argumentos.ejemplo else carpeta.name
    datos = construir_datos(tablas, config, origen)

    resumen = [
        f"Carpeta de datos: {carpeta}",
        f"Transacciones: {datos['meta']['filas']['transacciones']:,}".replace(",", "."),
        f"Cajeros: {len(datos['dim']['cajeros']['id'])}   Locales: {len(datos['dim']['locales']['id'])}",
        f"Períodos: {datos['meta']['periodos'][0]} a {datos['meta']['periodos'][-1]}"
        f" (último mes completo: {datos['meta']['periodo_corte']})",
        "Tipo de zona: " + ("calculado por volumen" if datos["meta"]["zona_calculada"] else "tomado del dato"),
        "Opcionales presentes: "
        + ", ".join(k for k, v in datos["meta"]["opcionales"].items() if v)
        or "ninguno",
    ]
    pares = datos["meta"]["pares"]
    lineas_pares = [
        f"Origen del grupo de pares (D-27): {pares['origen']}",
        f"Mínimo para tener vara propia: {pares['minimo_cajero_mes']} cajero-mes",
    ]
    for nombre in pares["grupos"]:
        lineas_pares.append(f"  {nombre}: {pares['conteo'].get(nombre, 0)} cajero-mes")
    if pares["fundidos"]:
        lineas_pares.append(
            "Fundidos por falta de base: " + ", ".join(pares["fundidos"])
        )
    reporte.agregar(
        "8. Grupos de pares (comparación entre jefes zonales)", lineas_pares, informativo=True
    )

    reporte.escribir(DIST / "validacion.txt", resumen)

    DIST.mkdir(parents=True, exist_ok=True)
    salida = Path(argumentos.salida) if argumentos.salida else RAIZ / config["salida"]["archivo"]
    html = construir_html(datos, config)
    salida.write_text(html, encoding="utf-8")
    tamanio = salida.stat().st_size / (1024 * 1024)
    print(f"OK  {salida}  ({tamanio:.1f} MB)")
    if tamanio > config["salida"]["tamanio_maximo_mb"]:
        print(f"AVISO: supera el objetivo de {config['salida']['tamanio_maximo_mb']} MB")

    if argumentos.por_jefe_zonal:
        for i, jefe in enumerate(datos["dim"]["jefes"]):
            recorte = recortar_por_jefe(datos, i)
            if not recorte["tx"]["periodo"]:
                continue
            nombre = re.sub(r"[^a-z0-9]+", "-", sin_acentos(jefe).lower()).strip("-")
            destino = salida.parent / f"{config['salida']['prefijo_por_jefe_zonal']}{nombre}.html"
            destino.write_text(construir_html(recorte, config), encoding="utf-8")
            print(f"OK  {destino}  ({destino.stat().st_size / (1024 * 1024):.1f} MB)")

    print(f"Validación: {DIST / 'validacion.txt'}  ({reporte.errores} errores, {reporte.avisos} avisos)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
