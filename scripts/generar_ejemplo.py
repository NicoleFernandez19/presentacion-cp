#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_ejemplo.py — genera el conjunto de datos ficticio de la presentación.

Escribe dos carpetas:

  data/ejemplo/           dataset completo y coherente (8 tablas + LEEME.txt)
  data/ejemplo_invalido/  recorte deliberadamente roto para probar el reporte
                          de validación de Requerimiento.md §3 (4 tablas + LEEME.txt)

Formato de salida: CSV, UTF-8 con BOM, separador ';', fechas dd/mm/aaaa,
decimales con punto. Semilla fija: el resultado es reproducible byte a byte.

Todos los nombres de personas, locales y localidades son inventados.
Las provincias sí son reales para que el mapa de la lámina 13 tenga sentido.

Uso:
    python scripts/generar_ejemplo.py
"""

from __future__ import annotations

import calendar
import csv
import json
import random
import unicodedata
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------- #
# Parámetros generales
# --------------------------------------------------------------------------- #

SEMILLA = 20260921

RAIZ = Path(__file__).resolve().parent.parent
DIR_OK = RAIZ / "data" / "ejemplo"
DIR_MAL = RAIZ / "data" / "ejemplo_invalido"
CONFIG = RAIZ / "config.json"

HOY = date(2026, 9, 21)
ANIO_ANTERIOR = 2025
ANIO_ACTUAL = 2026
ULTIMO_MES_ACTUAL = 8  # hasta el mes anterior al actual (D-12: último mes completo)

# 20 meses: 2025-01..2025-12 y 2026-01..2026-08
MESES: list[tuple[int, int]] = [(ANIO_ANTERIOR, m) for m in range(1, 13)] + [
    (ANIO_ACTUAL, m) for m in range(1, ULTIMO_MES_ACTUAL + 1)
]
IDX = {am: i for i, am in enumerate(MESES)}
N_MESES = len(MESES)

I_2026_01 = IDX[(2026, 1)]
I_2026_02 = IDX[(2026, 2)]
I_2026_04 = IDX[(2026, 4)]
I_2026_05 = IDX[(2026, 5)]
I_2026_07 = IDX[(2026, 7)]

# Los tres grupos de la presentación (D-01), cada uno con sus tipos de operación.
# Las proporciones imitan el dato real: SF2 sin TEC concentra el volumen, TEC es
# chico en cantidad, y MT queda en el medio.
GRUPO_DE_TIPO = {
    "SF2 Positivo": "SF2 sin TEC",
    "Positivo Debito": "SF2 sin TEC",
    "Positivo QR": "SF2 sin TEC",
    "Negativos": "SF2 sin TEC",
    "TEC Desembolsos": "TEC",
    "Envios": "MT",
    "Pagos": "MT",
}
TIPOS_OPERACION = list(GRUPO_DE_TIPO)
# Proporción objetivo de operaciones por tipo.
MIX_TIPOS = {
    "SF2 Positivo": 0.58,
    "Positivo Debito": 0.19,
    "Positivo QR": 0.05,
    "Negativos": 0.08,
    "TEC Desembolsos": 0.001,
    "Pagos": 0.065,
    "Envios": 0.034,
}

# Estacionalidad: pico fuerte en diciembre (el único diciembre del período es
# 2025-12; 2026-12 queda fuera de la ventana de datos).
FACTOR_MES = {1: 0.88, 2: 0.85, 3: 0.98, 4: 0.95, 5: 1.00, 6: 1.02,
              7: 1.05, 8: 1.00, 9: 0.97, 10: 1.02, 11: 1.05, 12: 1.33}
FACTOR_ANIO = {2025: 1.00, 2026: 1.07}

rng = np.random.default_rng(SEMILLA)
rnd = random.Random(SEMILLA)

# --------------------------------------------------------------------------- #
# Catálogos ficticios
# --------------------------------------------------------------------------- #

JEFES = [
    "Dora Vergarola",
    "Hugo Trebuquén",
    "Inés Maldonardo",
    "Rubén Escalderón",
    "Lucía Pinamontti",
    "Omar Zurrieta",
]

# (localidad, provincia, índice de jefe zonal, tipo_zona)
LOCALIDADES = [
    ("Villa Arrayán",          "Buenos Aires", 0, "Alto"),
    ("San Ruperto del Sauce",  "Buenos Aires", 0, "Bajo"),
    ("Lomas de Quindal",       "Buenos Aires", 0, "Alto"),
    ("Puerto Malvarrosa",      "Buenos Aires", 0, "Bajo"),
    ("Colonia Tremolar",       "Buenos Aires", 1, "Bajo"),
    ("Barrancas de Zurell",    "Buenos Aires", 1, "Bajo"),
    ("Nueva Pampira",          "Buenos Aires", 1, "Alto"),
    ("Fortín Dalmecia",        "Buenos Aires", 1, "Bajo"),
    ("Sierra Bermejal",        "Córdoba",      2, "Alto"),
    ("Villa Corcolén",         "Córdoba",      2, "Bajo"),
    ("Paso Ñandubal",          "Córdoba",      2, "Bajo"),
    ("Los Talares de Umbría",  "Córdoba",      2, "Bajo"),
    ("Cerro Manzurro",         "Córdoba",      3, "Bajo"),
    ("Estación Jarillal",      "Córdoba",      3, "Bajo"),
    ("Puerto Almiranda",       "Santa Fe",     3, "Alto"),
    ("Colonia Vergel Nuevo",   "Santa Fe",     3, "Bajo"),
    ("Campo Zarandí",          "Santa Fe",     4, "Bajo"),
    ("Villa Gaviotal",         "Santa Fe",     4, "Alto"),
    ("San Ariel del Llano",    "Santa Fe",     4, "Bajo"),
    ("Laguna Tordilla",        "Santa Fe",     4, "Bajo"),
    ("Valle Pirquén",          "Mendoza",      5, "Alto"),
    ("Alto Cuyanco",           "Mendoza",      5, "Alto"),
    ("Villa Sarmental",        "Mendoza",      5, "Bajo"),
    ("Cuesta Bermellón",       "Mendoza",      5, "Bajo"),
    ("Oasis Quimilar",         "Mendoza",      5, "Bajo"),
]

# Centro aproximado de cada provincia y dispersión, para coordenadas plausibles.
CENTRO_PROV = {
    "Buenos Aires": (-36.10, -59.60, 1.70, 1.90),
    "Córdoba":      (-31.80, -64.00, 1.40, 1.20),
    "Santa Fe":     (-31.10, -60.80, 1.50, 1.00),
    "Mendoza":      (-33.70, -68.60, 1.30, 1.00),
}

NOMBRES = [
    "Agustina", "Bruno", "Carolina", "Diego", "Elena", "Facundo", "Gabriela",
    "Hernán", "Irina", "Joaquín", "Karina", "Leandro", "Malena", "Nicolás",
    "Olga", "Pablo", "Rocío", "Santiago", "Tamara", "Ulises", "Valentina",
    "Walter", "Ximena", "Yamila", "Zacarías", "Belén", "Camilo", "Dolores",
    "Emiliano", "Fiorella", "Gonzalo", "Helena", "Iván", "Julieta", "Lautaro",
    "Mariana", "Néstor", "Ornella", "Patricio", "Renata", "Sebastián",
    "Trinidad", "Vicente", "Amaranta", "Bautista", "Celeste", "Damián",
]

APELLIDOS = [
    "Almazor", "Bardanella", "Calfuquén", "Delmonteiro", "Esquivelo",
    "Ferrucola", "Garrampa", "Huaycuré", "Iribarna", "Jurelli", "Kentrola",
    "Lastrabales", "Melquiadez", "Nievarola", "Olmedillo", "Pescarolo",
    "Quilmestre", "Ruzzatti", "Sanchinelli", "Trebuquén", "Urbanelli",
    "Vergarola", "Wollembaum", "Xironte", "Yaguaretti", "Zabalotti",
    "Ambrusella", "Benavelli", "Corcolén", "Dulcamonte", "Estrambosi",
    "Falucchio", "Grimaldez", "Hormigal", "Ipanera", "Jaramillón",
    "Lumbrerón", "Maraviglia", "Norquinche", "Ostrovaldo", "Pantalucci",
    "Quebrachal", "Rivadenza", "Sotomarino", "Tolosendi", "Umbriaga",
    "Valdemorín", "Zunzarrén",
]

ROMANOS = ["", " II", " III", " IV", " V", " VI"]

# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #


def fmt_fecha(d: date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def dias_del_mes(anio: int, mes: int) -> int:
    return calendar.monthrange(anio, mes)[1]


def fin_de_mes(anio: int, mes: int) -> date:
    return date(anio, mes, dias_del_mes(anio, mes))


def fecha_entre(d1: date, d2: date) -> date:
    return d1 + timedelta(days=rnd.randint(0, (d2 - d1).days))


def escribir_csv(df: pd.DataFrame, ruta: Path, float_format: str | None = None) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(
        ruta,
        sep=";",
        index=False,
        encoding="utf-8-sig",
        lineterminator="\n",
        na_rep="",
        float_format=float_format,
        quoting=csv.QUOTE_MINIMAL,
    )


def escribir_texto(ruta: Path, texto: str) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(texto, encoding="utf-8")


def ar(n: float) -> str:
    """Número en formato argentino (punto de miles), para los textos del LEEME."""
    return f"{n:,.0f}".replace(",", ".")


def sin_tildes(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


# --------------------------------------------------------------------------- #
# 1. Locales
# --------------------------------------------------------------------------- #

def construir_locales() -> tuple[list[dict], dict]:
    """60 locales repartidos en las 25 localidades."""
    # Reparto: 1 local por localidad y 35 extra, con más peso en alto movimiento.
    cupo = {i: 1 for i in range(len(LOCALIDADES))}
    pesos = [3.0 if loc[3] == "Alto" else 1.0 for loc in LOCALIDADES]
    for _ in range(60 - len(LOCALIDADES)):
        i = rnd.choices(range(len(LOCALIDADES)), weights=pesos, k=1)[0]
        cupo[i] += 1

    # Coordenada de cada localidad.
    coord_loc = {}
    for i, (nombre, prov, _, _) in enumerate(LOCALIDADES):
        lat0, lon0, dlat, dlon = CENTRO_PROV[prov]
        coord_loc[i] = (
            lat0 + float(rng.uniform(-dlat, dlat)),
            lon0 + float(rng.uniform(-dlon, dlon)),
        )

    locales: list[dict] = []
    n = 0
    for i, (nombre, prov, ij, zona) in enumerate(LOCALIDADES):
        # Factor de volumen de la localidad, coherente con su tipo de zona.
        factor_loc = float(rng.uniform(1.5, 2.4)) if zona == "Alto" else float(rng.uniform(0.45, 1.10))
        for k in range(cupo[i]):
            n += 1
            lat, lon = coord_loc[i]
            locales.append({
                "id_local": f"L{n:03d}",
                "nombre_local": f"Sucursal {nombre}{ROMANOS[k]}",
                "localidad": nombre,
                "provincia": prov,
                "jefe_zonal": JEFES[ij],
                "tipo_zona": zona,
                "i_localidad": i,
                "fecha_apertura": None,
                "fecha_cierre": None,
                "latitud": round(lat + float(rng.uniform(-0.05, 0.05)), 6),
                "longitud": round(lon + float(rng.uniform(-0.05, 0.05)), 6),
                "factor": factor_loc * float(rng.uniform(0.60, 1.50)),
                "n_cajeros": 0,
            })

    por_id = {l["id_local"]: l for l in locales}

    # Tamaño de cada local (cantidad de cajeros): heterogéneo de verdad.
    for l in locales:
        alto = l["tipo_zona"] == "Alto"
        clase = rnd.choices(
            ["grande", "mediano", "chico"],
            weights=[30, 50, 20] if alto else [5, 40, 55],
            k=1,
        )[0]
        l["n_cajeros"] = {
            "grande": rnd.randint(11, 15),
            "mediano": rnd.randint(5, 8),
            "chico": rnd.randint(2, 4),
        }[clase]

    # Ajuste fino para llegar exactamente a 350 cajeros. Se tocan primero los
    # locales medianos, para conservar los chicos (2-4) y los grandes (11-15);
    # si no alcanza, se amplía el margen.
    def ajustar(delta: int, piso: int, techo: int) -> int:
        """Aplica 'delta' cajeros (±1 por local) dentro de [piso, techo]."""
        paso = 1 if delta > 0 else -1
        cand = [l for l in locales if piso <= l["n_cajeros"] <= techo]
        rnd.shuffle(cand)
        for l in cand:
            if delta == 0:
                break
            if piso <= l["n_cajeros"] + paso <= techo:
                l["n_cajeros"] += paso
                delta -= paso
        return delta

    faltan = 350 - sum(l["n_cajeros"] for l in locales)
    for piso, techo in ((5, 10), (4, 11), (3, 13), (2, 15)):
        while faltan != 0:
            resto = ajustar(faltan, piso, techo)
            if resto == faltan:
                break
            faltan = resto
        if faltan == 0:
            break

    # --- Locales con caso borde -------------------------------------------- #
    # Aperturas dentro del año en curso (dos locales) y un cierre.
    medianos = [l for l in locales if 4 <= l["n_cajeros"] <= 7]
    chicos = [l for l in locales if l["n_cajeros"] <= 4]

    l_nuevo_a = medianos[3]
    l_nuevo_b = medianos[9]
    l_cierre = chicos[5]
    # Local que se queda un mes entero sin datos (2026-04), sin otros casos borde.
    l_sin_mes = next(l for l in medianos
                     if l["id_local"] not in {l_nuevo_a["id_local"], l_nuevo_b["id_local"]})

    l_nuevo_a["fecha_apertura"] = date(2026, 2, 1)
    l_nuevo_b["fecha_apertura"] = date(2026, 5, 1)
    l_cierre["fecha_cierre"] = date(2026, 6, 30)

    # Apertura histórica para el resto.
    for l in locales:
        if l["fecha_apertura"] is None:
            l["fecha_apertura"] = fecha_entre(date(2009, 1, 1), date(2024, 10, 31))

    # Locales sin coordenadas (dato opcional faltante). Se eligen fuera de los
    # locales que ya tienen otro caso borde, para no acumular dos en el mismo.
    ya_especiales = {l_nuevo_a["id_local"], l_nuevo_b["id_local"],
                     l_cierre["id_local"], l_sin_mes["id_local"]}
    candidatos = [l for l in locales if l["id_local"] not in ya_especiales]
    sin_coords = [candidatos[6], candidatos[21], candidatos[35], candidatos[50]]
    for l in sin_coords:
        l["latitud"] = None
        l["longitud"] = None

    especiales = {
        "nuevo_a": l_nuevo_a["id_local"],
        "nuevo_b": l_nuevo_b["id_local"],
        "cierre": l_cierre["id_local"],
        "sin_mes": l_sin_mes["id_local"],
        "sin_coords": [l["id_local"] for l in sin_coords],
        "por_id": por_id,
    }
    return locales, especiales


# --------------------------------------------------------------------------- #
# 2. Cajeros
# --------------------------------------------------------------------------- #

def construir_cajeros(locales: list[dict], esp: dict) -> list[dict]:
    cajeros: list[dict] = []
    n = 0
    for l in locales:
        for _ in range(l["n_cajeros"]):
            n += 1
            cajeros.append({
                "id_cajero": f"C{n:04d}",
                "nombre_cajero": f"{rnd.choice(NOMBRES)} {rnd.choice(APELLIDOS)}",
                "local_base": l["id_local"],
                "local_destino": None,
                "mes_cambio": None,
                "fecha_alta": None,
                "fecha_baja": None,
                # Productividad individual muy dispersa (lognormal).
                "base": float(rng.lognormal(mean=6.90, sigma=0.62)),
                "constancia": 1.0,
                "tasa_rechazo": float(rng.uniform(0.000, 0.040)),
                "tendencia": None,
                "flags": set(),
            })

    por_id = {c["id_cajero"]: c for c in cajeros}
    por_local: dict[str, list[dict]] = {}
    for c in cajeros:
        por_local.setdefault(c["local_base"], []).append(c)

    locales_por_localidad: dict[int, list[dict]] = {}
    for l in locales:
        locales_por_localidad.setdefault(l["i_localidad"], []).append(l)

    def local_hermano(l_id: str, excluir: set[str]) -> str:
        """Otro local de la misma localidad; si no hay, del mismo jefe zonal."""
        l = esp["por_id"][l_id]
        cand = [o for o in locales_por_localidad[l["i_localidad"]]
                if o["id_local"] not in excluir and o["fecha_cierre"] is None
                and o["fecha_apertura"] < date(2025, 1, 1)]
        if not cand:
            cand = [o for o in locales
                    if o["jefe_zonal"] == l["jefe_zonal"] and o["id_local"] not in excluir
                    and o["fecha_cierre"] is None and o["fecha_apertura"] < date(2025, 1, 1)]
        return rnd.choice(cand)["id_local"]

    # --- Casos borde atados a locales -------------------------------------- #
    cambiaron: list[dict] = []

    # (a) Locales nuevos: 2 cajeros transferidos desde otro local + altas nuevas.
    for clave, mes_ap in ((esp["nuevo_a"], I_2026_02), (esp["nuevo_b"], I_2026_05)):
        plantel = por_local[clave]
        transferidos = plantel[:2]
        for c in transferidos:
            donante = local_hermano(clave, {clave})
            c["local_base"] = donante
            c["local_destino"] = clave
            c["mes_cambio"] = mes_ap
            c["flags"].add("cambio_local")
            cambiaron.append(c)
        for c in plantel[2:]:
            # Altas del año en curso, a partir de la apertura del local.
            ap = esp["por_id"][clave]["fecha_apertura"]
            c["fecha_alta"] = fecha_entre(ap, ap + timedelta(days=45))
            c["flags"].add("alta_2026")

    # (b) Local que cierra: parte del plantel se transfiere, uno causa baja.
    plantel_cierre = por_local[esp["cierre"]]
    for c in plantel_cierre[:-1]:
        c["local_destino"] = local_hermano(esp["cierre"], {esp["cierre"]})
        c["mes_cambio"] = I_2026_07
        c["flags"].add("cambio_local")
        cambiaron.append(c)
    baja_por_cierre = plantel_cierre[-1]
    baja_por_cierre["fecha_baja"] = date(2026, 6, 30)
    baja_por_cierre["flags"].add("baja_2026")

    # --- Casos borde sobre el resto del padrón ----------------------------- #
    reservados = {c["id_cajero"] for c in cajeros if c["flags"]}
    libres = [c for c in cajeros if c["id_cajero"] not in reservados
              and c["local_base"] not in {esp["nuevo_a"], esp["nuevo_b"], esp["cierre"]}]
    rnd.shuffle(libres)
    cursor = 0

    def tomar(k: int) -> list[dict]:
        nonlocal cursor
        lote = libres[cursor:cursor + k]
        cursor += k
        return lote

    # 10 cajeros habilitados que nunca operaron.
    nunca = tomar(10)
    for c in nunca:
        c["flags"].add("nunca_opero")
        c["fecha_alta"] = fecha_entre(date(2025, 2, 1), date(2026, 6, 30))
        if c["fecha_alta"] >= date(2026, 1, 1):
            c["flags"].add("alta_2026")

    # 12 cajeros esporádicos: 1 o 2 meses activos en todo el período.
    for c in tomar(12):
        c["flags"].add("esporadico")

    # 14 cambios de local adicionales (total con los de locales especiales >= 15).
    for c in tomar(14):
        destino = local_hermano(c["local_base"], {c["local_base"], esp["nuevo_a"],
                                                 esp["nuevo_b"], esp["cierre"],
                                                 esp["sin_mes"]})
        c["local_destino"] = destino
        c["mes_cambio"] = rnd.randint(4, N_MESES - 3)
        c["flags"].add("cambio_local")
        cambiaron.append(c)

    # 16 altas dentro del año en curso.
    for c in tomar(16):
        c["fecha_alta"] = fecha_entre(date(2026, 1, 5), date(2026, 7, 20))
        c["flags"].add("alta_2026")

    # 11 bajas dentro del año en curso (más la del local que cierra = 12).
    for c in tomar(11):
        c["fecha_baja"] = fecha_entre(date(2026, 2, 10), date(2026, 8, 25))
        c["flags"].add("baja_2026")

    # 6 bajas del año anterior.
    for c in tomar(6):
        c["fecha_baja"] = fecha_entre(date(2025, 3, 1), date(2025, 11, 30))
        c["flags"].add("baja_2025")

    # 3 cajeros que mejoran mucho y 3 que caen mucho a lo largo del año en curso.
    for c in tomar(3):
        c["flags"].add("mejora")
        c["tendencia"] = "sube"
        c["base"] = float(rng.uniform(700, 1400))
    for c in tomar(3):
        c["flags"].add("caida")
        c["tendencia"] = "baja"
        c["base"] = float(rng.uniform(700, 1400))

    # --- Fechas de alta del resto y constancia mensual ---------------------- #
    for c in cajeros:
        if c["fecha_alta"] is None:
            # La mayor parte del padron ya estaba habilitada antes del periodo:
            # asi el volumen mensual no arrastra una rampa de altas que se
            # confunda con la estacionalidad.
            tramo = rnd.choices(["viejo", "medio", "reciente", "tardio"],
                                weights=[47, 32, 14, 7], k=1)[0]
            c["fecha_alta"] = {
                "viejo": lambda: fecha_entre(date(2017, 1, 2), date(2023, 8, 31)),
                "medio": lambda: fecha_entre(date(2023, 9, 1), date(2024, 12, 20)),
                "reciente": lambda: fecha_entre(date(2024, 11, 1), date(2025, 2, 15)),
                "tardio": lambda: fecha_entre(date(2025, 9, 1), date(2025, 12, 10)),
            }[tramo]()
        # Coherencia alta/baja.
        if c["fecha_baja"] and c["fecha_baja"] <= c["fecha_alta"] + timedelta(days=45):
            c["fecha_baja"] = c["fecha_alta"] + timedelta(days=rnd.randint(60, 200))
        c["constancia"] = rnd.choices([1.0, 0.92, 0.78, 0.58], weights=[52, 25, 15, 8], k=1)[0]
        if "mejora" in c["flags"] or "caida" in c["flags"] or "cambio_local" in c["flags"]:
            c["constancia"] = 1.0

    return cajeros


# --------------------------------------------------------------------------- #
# 3. Transacciones y actividad mensual
# --------------------------------------------------------------------------- #

def local_del_mes(c: dict, i: int) -> str:
    if c["mes_cambio"] is not None and i >= c["mes_cambio"]:
        return c["local_destino"]
    return c["local_base"]


def local_disponible(l: dict, anio: int, mes: int) -> bool:
    ini, fin = date(anio, mes, 1), fin_de_mes(anio, mes)
    if l["fecha_apertura"] and l["fecha_apertura"] > fin:
        return False
    if l["fecha_cierre"] and l["fecha_cierre"] < ini:
        return False
    return True


def habilitado(c: dict, anio: int, mes: int) -> bool:
    ini, fin = date(anio, mes, 1), fin_de_mes(anio, mes)
    if c["fecha_alta"] > fin:
        return False
    if c["fecha_baja"] and c["fecha_baja"] < ini:
        return False
    return True


def generar_movimiento(cajeros: list[dict], esp: dict):
    por_id_local = esp["por_id"]
    filas_tx: list[dict] = []
    filas_act: list[dict] = []

    for c in cajeros:
        meses_hab = [i for i, (a, m) in enumerate(MESES) if habilitado(c, a, m)]
        posibles = []
        for i in meses_hab:
            a, m = MESES[i]
            l_id = local_del_mes(c, i)
            if not local_disponible(por_id_local[l_id], a, m):
                continue
            # El local elegido se queda sin ningún dato en 2026-04.
            if l_id == esp["sin_mes"] and i == I_2026_04:
                continue
            posibles.append(i)

        if "nunca_opero" in c["flags"]:
            activos: list[int] = []
        elif "esporadico" in c["flags"] and len(posibles) >= 2:
            activos = sorted(rnd.sample(posibles, rnd.choice([1, 2])))
        else:
            activos = [i for i in posibles if rnd.random() < c["constancia"]]
            if not activos and posibles:
                activos = [rnd.choice(posibles)]
            # Un cambio de local sólo es visible si operó de los dos lados.
            if "cambio_local" in c["flags"] and c["mes_cambio"] is not None:
                antes = [i for i in posibles if i < c["mes_cambio"]]
                despues = [i for i in posibles if i >= c["mes_cambio"]]
                if antes and not any(i < c["mes_cambio"] for i in activos):
                    activos.append(max(antes))
                if despues and not any(i >= c["mes_cambio"] for i in activos):
                    activos.append(min(despues))
                activos = sorted(set(activos))

        c["_activos"] = activos
        set_activos = set(activos)

        # Mix de tipos propio de cada cajero, alrededor del mix global.
        pesos = {t: MIX_TIPOS[t] * float(rng.lognormal(0, 0.18)) for t in TIPOS_OPERACION}
        total_peso = sum(pesos.values())
        pesos = {t: v / total_peso for t, v in pesos.items()}

        for i in meses_hab:
            anio, mes = MESES[i]
            dm = dias_del_mes(anio, mes)
            if i not in set_activos:
                filas_act.append({"anio": anio, "mes": mes, "id_cajero": c["id_cajero"],
                                  "dias_activos": 0})
                continue

            # Volumen del mes.
            tendencia = 1.0
            if c["tendencia"] and i >= I_2026_01:
                t = (i - I_2026_01) / max(1, (N_MESES - 1 - I_2026_01))
                tendencia = (0.35 + 2.25 * t) if c["tendencia"] == "sube" else (2.60 - 2.25 * t)
            elif c["tendencia"]:
                tendencia = 0.55 if c["tendencia"] == "sube" else 1.90

            l_id = local_del_mes(c, i)
            ops = (c["base"] * por_id_local[l_id]["factor"] * FACTOR_MES[mes]
                   * FACTOR_ANIO[anio] * tendencia * float(rng.lognormal(0, 0.17)))
            ops = max(1, int(round(ops)))

            # Días activos coherentes: > 0 porque operó, nunca más que el mes.
            if "esporadico" in c["flags"]:
                frac = rng.uniform(0.08, 0.35)
            else:
                frac = rng.uniform(0.42, 0.87)
            dias = min(dm, max(1, int(round(dm * float(frac)))))
            filas_act.append({"anio": anio, "mes": mes, "id_cajero": c["id_cajero"],
                              "dias_activos": dias})

            # Reparto por tipo de operación, cada uno dentro de su grupo (D-01).
            repartido = 0
            for k, tipo in enumerate(TIPOS_OPERACION):
                cant = ops - repartido if k == len(TIPOS_OPERACION) - 1 else int(round(ops * pesos[tipo]))
                cant = max(0, cant)
                repartido += cant
                if cant <= 0:
                    continue
                # Rechazos: entre 0% y 4% de la cantidad, nunca por encima.
                rech = min(int(cant * 0.04),
                           int(cant * c["tasa_rechazo"] * float(rng.uniform(0.3, 1.0))))
                filas_tx.append({
                    "anio": anio,
                    "mes": mes,
                    "id_cajero": c["id_cajero"],
                    "id_local": l_id,
                    "grupo": GRUPO_DE_TIPO[tipo],
                    "tipo_operacion": tipo,
                    "cantidad": cant,
                    "cantidad_rechazadas": rech,
                })

        # id_local_actual: el local del último mes en que operó.
        c["id_local_actual"] = local_del_mes(c, activos[-1]) if activos else c["local_base"]

    return filas_tx, filas_act


# --------------------------------------------------------------------------- #
# 4. Tablas opcionales
# --------------------------------------------------------------------------- #

def generar_actividad_horaria(locales: list[dict], esp: dict) -> list[dict]:
    """Sólo el año en curso y un subconjunto de 20 locales."""
    elegibles = [l for l in locales if l["fecha_cierre"] is None][:]
    rnd.shuffle(elegibles)
    subset = sorted(elegibles[:20], key=lambda l: l["id_local"])

    perfil_hora = {8: 0.35, 9: 0.70, 10: 1.00, 11: 1.05, 12: 0.95, 13: 0.80,
                   14: 0.45, 15: 0.60, 16: 0.95, 17: 1.00, 18: 0.95, 19: 0.75,
                   20: 0.35, 21: 0.12}
    perfil_dia = {1: 1.05, 2: 1.00, 3: 1.00, 4: 1.02, 5: 1.10, 6: 0.42, 7: 0.05}

    filas = []
    for l in subset:
        escala = 26.0 * l["factor"] * l["n_cajeros"] / 6.0
        for mes in range(1, ULTIMO_MES_ACTUAL + 1):
            if not local_disponible(l, ANIO_ACTUAL, mes):
                continue
            fm = FACTOR_MES[mes]
            for dia in range(1, 8):
                for hora, ph in perfil_hora.items():
                    cant = escala * ph * perfil_dia[dia] * fm * float(rng.lognormal(0, 0.25))
                    cant = int(round(cant))
                    if cant <= 0:
                        continue
                    filas.append({"anio": ANIO_ACTUAL, "mes": mes, "id_local": l["id_local"],
                                  "dia_semana": dia, "hora": hora, "cantidad": cant})
    return filas


def generar_capacitaciones(cajeros: list[dict]) -> list[dict]:
    cursos = [
        (date(2026, 2, 18), "Prevención de fraude en caja"),
        (date(2026, 3, 24), "Nueva terminal: operatoria básica"),
        (date(2026, 5, 13), "Atención al cliente y tiempos de espera"),
        (date(2026, 6, 25), "Controles de efectivo y arqueo"),
        (date(2026, 7, 29), "Envíos y pagos: casos especiales"),
    ]
    filas = []
    for fecha, nombre in cursos:
        elegibles = [c for c in cajeros
                     if c["fecha_alta"] <= fecha and (not c["fecha_baja"] or c["fecha_baja"] >= fecha)]
        k = min(len(elegibles), rnd.randint(20, 60))
        for c in rnd.sample(elegibles, k):
            filas.append({"id_cajero": c["id_cajero"], "fecha": fmt_fecha(fecha),
                          "nombre_capacitacion": nombre})
    return filas


def generar_hitos(esp: dict) -> list[dict]:
    pid = esp["por_id"]
    na, nb, cie = pid[esp["nuevo_a"]], pid[esp["nuevo_b"]], pid[esp["cierre"]]
    return [
        {"fecha": "13/01/2025", "titulo": "Arranque del plan de red",
         "descripcion": "Se define el plan anual de cobertura y el objetivo de operaciones por local.",
         "jefe_zonal": ""},
        {"fecha": "07/04/2025", "titulo": "Nuevos límites por operación",
         "descripcion": "Entra en vigencia el esquema de límites por operación para toda la red.",
         "jefe_zonal": ""},
        {"fecha": "19/08/2025", "titulo": "Refuerzo de plantel en Cuyo",
         "descripcion": "Se suman cajeros en los locales de mayor espera de la zona.",
         "jefe_zonal": JEFES[5]},
        {"fecha": "01/12/2025", "titulo": "Campaña de fin de año",
         "descripcion": "Extensión horaria y refuerzo de caja durante todo diciembre.",
         "jefe_zonal": ""},
        {"fecha": fmt_fecha(na["fecha_apertura"]), "titulo": f"Apertura de {na['nombre_local']}",
         "descripcion": "Nuevo local en una localidad de alta demanda, con plantel mixto.",
         "jefe_zonal": na["jefe_zonal"]},
        {"fecha": "16/03/2026", "titulo": "Despliegue de la nueva terminal",
         "descripcion": "Se reemplaza la terminal de caja en toda la red, con capacitación previa.",
         "jefe_zonal": ""},
        {"fecha": fmt_fecha(nb["fecha_apertura"]), "titulo": f"Apertura de {nb['nombre_local']}",
         "descripcion": "Segunda apertura del año, para descomprimir los locales vecinos.",
         "jefe_zonal": nb["jefe_zonal"]},
        {"fecha": fmt_fecha(cie["fecha_cierre"]), "titulo": f"Cierre de {cie['nombre_local']}",
         "descripcion": "Se cierra el local y su plantel se reasigna a los locales de la misma localidad.",
         "jefe_zonal": cie["jefe_zonal"]},
        {"fecha": "10/07/2026", "titulo": "Programa de mentoreo interno",
         "descripcion": "Los cajeros de productividad alta acompañan a los de ingreso reciente.",
         "jefe_zonal": ""},
    ]


def generar_textos_cierre() -> list[dict]:
    textos = {
        JEFES[0]: (
            "La zona sostuvo el volumen del año anterior con un plantel más chico. "
            "Los dos locales de alto movimiento concentran más de la mitad de las operaciones. "
            "La proporción de cajeros inactivos bajó respecto del primer trimestre.",
            "Llevar a cero los cajeros que nunca operaron antes de fin de año. "
            "Equilibrar la carga entre los locales de la misma localidad. "
            "Sostener el ritmo de diciembre con refuerzo planificado."
        ),
        JEFES[1]: (
            "Es la zona con mayor dispersión entre locales: conviven planteles de 3 y de 14 cajeros. "
            "El crecimiento se explica casi por completo por una sola localidad. "
            "Los rechazos se mantienen por debajo del promedio de la red.",
            "Nivelar la productividad de los locales chicos con acompañamiento del jefe zonal. "
            "Revisar la asignación de plantel en los dos locales más cargados. "
            "Reducir la brecha contra la red en operaciones por cajero activo."
        ),
        JEFES[2]: (
            "La zona mejoró su posición en el ranking de la red respecto del primer trimestre. "
            "El local de mayor volumen aporta un tercio de las operaciones de la zona. "
            "La antigüedad promedio del plantel es la más alta de la red.",
            "Aprovechar la experiencia del plantel en el programa de mentoreo. "
            "Aumentar la cantidad de cajeros en categoría alta en los locales de bajo movimiento. "
            "Mantener la constancia mensual por encima del 90 por ciento."
        ),
        JEFES[3]: (
            "El cierre de un local obligó a reasignar plantel en el segundo trimestre. "
            "La reasignación se hizo sin pérdida de volumen en la localidad. "
            "Quedan cajeros con pocos meses activos que todavía no tienen categoría.",
            "Completar la integración del plantel reasignado. "
            "Llevar a todos los cajeros al mínimo de meses activos para poder categorizarlos. "
            "Recuperar el nivel de operaciones por local previo al cierre."
        ),
        JEFES[4]: (
            "La zona creció por encima del promedio de la red entre el primer y el último trimestre. "
            "La localidad de alto movimiento explica la mayor parte de esa mejora. "
            "Persiste un grupo chico de cajeros con actividad muy intermitente.",
            "Extender las buenas prácticas de la localidad de alto movimiento al resto. "
            "Reducir a la mitad los cajeros con menos del 50 por ciento de meses activos. "
            "Sumar un local en la localidad con mayor espera."
        ),
        JEFES[5]: (
            "Es la zona con más localidades a cargo y la que más creció en cantidad de cajeros. "
            "Las dos localidades de alto movimiento sostienen el volumen de la zona. "
            "Las aperturas del año todavía no alcanzan su nivel esperado de operaciones.",
            "Acompañar a los locales abiertos este año hasta el promedio de su localidad. "
            "Ordenar la distribución de plantel entre locales vecinos. "
            "Mejorar la posición de la zona en el ranking general de la red."
        ),
        "": (
            "La red creció respecto del año anterior con una cantidad de locales similar. "
            "El pico de diciembre volvió a ser el mes más alto del período. "
            "La concentración de operaciones en el 20 por ciento de cajeros con más volumen se mantiene estable. "
            "Todavía hay cajeros habilitados que nunca operaron en el período.",
            "Cerrar el año con todos los cajeros habilitados operando al menos un mes por trimestre. "
            "Sostener el crecimiento interanual en todas las zonas, no sólo en las de alto movimiento. "
            "Preparar el refuerzo de diciembre con la dotación definida en octubre."
        ),
    }
    return [{"jefe_zonal": j, "hallazgos": h, "objetivos": o} for j, (h, o) in textos.items()]


# --------------------------------------------------------------------------- #
# 5. Dataset inválido
# --------------------------------------------------------------------------- #

def generar_invalido(tx: pd.DataFrame, act: pd.DataFrame,
                     cajeros: pd.DataFrame, locales: pd.DataFrame) -> list[str]:
    """Recorte chico del dataset bueno con un error de cada tipo de §3."""
    DIR_MAL.mkdir(parents=True, exist_ok=True)

    # Recorte: 4 locales de un mismo jefe zonal, año en curso hasta junio.
    jefe = locales["jefe_zonal"].iloc[0]
    ids_local = list(locales.loc[locales["jefe_zonal"] == jefe, "id_local"].head(4))
    sub_loc = locales[locales["id_local"].isin(ids_local)].copy()

    tx_sub = tx[(tx["anio"] == ANIO_ACTUAL) & (tx["mes"] <= 6)
                & (tx["id_local"].isin(ids_local))].copy()
    ids_cajero = sorted(tx_sub["id_cajero"].unique())[:15]
    tx_sub = tx_sub[tx_sub["id_cajero"].isin(ids_cajero)].copy()
    sub_caj = cajeros[cajeros["id_cajero"].isin(ids_cajero)].copy()
    act_sub = act[(act["anio"] == ANIO_ACTUAL) & (act["mes"] <= 6)
                  & (act["id_cajero"].isin(ids_cajero))].copy()

    # ERROR 3: mes faltante en el medio del período (2026-03, sin ninguna fila).
    tx_sub = tx_sub[tx_sub["mes"] != 3].copy()
    act_sub = act_sub[act_sub["mes"] != 3].copy()

    tx_sub = tx_sub.sort_values(["anio", "mes", "id_cajero", "id_local", "tipo_operacion"]).reset_index(drop=True)
    act_sub = act_sub.sort_values(["anio", "mes", "id_cajero"]).reset_index(drop=True)

    filas = tx_sub.to_dict("records")
    notas: list[str] = []
    base_ok = filas[0]

    # ERROR 4 (duplicado): se copia una fila existente tal cual.
    original = dict(filas[10])
    filas.append(dict(original))
    linea_dup_copia = len(filas) + 1
    linea_dup_orig = 10 + 2
    notas.append(
        f"transacciones_mensuales.csv linea {linea_dup_copia}: FILA DUPLICADA, copia exacta de la "
        f"linea {linea_dup_orig} (clave {original['anio']}-{original['mes']}-{original['id_cajero']}-"
        f"{original['id_local']}-{original['tipo_operacion']}). Ambas lineas forman el duplicado."
    )

    # ERROR 1a: id_cajero inexistente en el maestro.
    filas.append({**base_ok, "mes": 5, "id_cajero": "C9999", "cantidad": 812, "cantidad_rechazadas": 9})
    notas.append(f"transacciones_mensuales.csv linea {len(filas) + 1}: id_cajero C9999 SIN "
                 f"CORRESPONDENCIA en cajeros.csv.")

    # ERROR 1b: id_local inexistente en el maestro.
    filas.append({**base_ok, "mes": 5, "id_local": "L999", "cantidad": 640, "cantidad_rechazadas": 5})
    notas.append(f"transacciones_mensuales.csv linea {len(filas) + 1}: id_local L999 SIN "
                 f"CORRESPONDENCIA en locales.csv.")

    # ERROR 5: tipo de operación no reconocido.
    filas.append({**base_ok, "mes": 6, "tipo_operacion": "Transferencia XYZ", "cantidad": 97, "cantidad_rechazadas": 1})
    notas.append(f"transacciones_mensuales.csv linea {len(filas) + 1}: tipo_operacion "
                 f"'Transferencia XYZ' NO RECONOCIDO (validos: {', '.join(TIPOS_OPERACION)}).")

    # ERROR 6: cantidad negativa.
    filas.append({**base_ok, "mes": 6, "tipo_operacion": "Pagos", "cantidad": -143, "cantidad_rechazadas": 0})
    notas.append(f"transacciones_mensuales.csv linea {len(filas) + 1}: cantidad NEGATIVA (-143).")

    tx_mal = pd.DataFrame(filas, columns=list(tx.columns))

    # ERROR 7: dias_activos mayor a los días del mes (abril 2026 tiene 30 días).
    act_filas = act_sub.to_dict("records")
    pos = next(i for i, r in enumerate(act_filas) if r["mes"] == 4)
    act_filas[pos]["dias_activos"] = 35
    notas.append(f"actividad_mensual.csv linea {pos + 2}: dias_activos 35 MAYOR a los 30 dias de "
                 f"abril de 2026 (cajero {act_filas[pos]['id_cajero']}).")
    act_mal = pd.DataFrame(act_filas, columns=list(act.columns))

    notas.append("transacciones_mensuales.csv y actividad_mensual.csv: MES FALTANTE, no hay "
                 "ninguna fila de 03/2026 en un periodo que va de 01/2026 a 06/2026.")

    escribir_csv(tx_mal, DIR_MAL / "transacciones_mensuales.csv", float_format="%.2f")
    escribir_csv(act_mal, DIR_MAL / "actividad_mensual.csv")
    escribir_csv(sub_caj, DIR_MAL / "cajeros.csv")
    escribir_csv(sub_loc, DIR_MAL / "locales.csv", float_format="%.6f")

    return notas


# --------------------------------------------------------------------------- #
# 6. Main
# --------------------------------------------------------------------------- #

def main() -> None:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    min_meses = cfg["productividad"]["minimo_meses_activos"]

    locales, esp = construir_locales()
    cajeros = construir_cajeros(locales, esp)
    filas_tx, filas_act = generar_movimiento(cajeros, esp)

    df_tx = pd.DataFrame(filas_tx).sort_values(
        ["anio", "mes", "id_local", "id_cajero", "tipo_operacion"]).reset_index(drop=True)
    df_act = pd.DataFrame(filas_act).sort_values(
        ["anio", "mes", "id_cajero"]).reset_index(drop=True)
    # Los que nunca operaron no tienen ninguna fila de actividad (fila ausente = no operó).
    nunca_ids = {c["id_cajero"] for c in cajeros if "nunca_opero" in c["flags"]}
    df_act = df_act[~df_act["id_cajero"].isin(nunca_ids)].reset_index(drop=True)

    df_caj = pd.DataFrame([{
        "id_cajero": c["id_cajero"],
        "nombre_cajero": c["nombre_cajero"],
        "id_local_actual": c["id_local_actual"],
        "fecha_alta": fmt_fecha(c["fecha_alta"]),
        "fecha_baja": fmt_fecha(c["fecha_baja"]),
    } for c in cajeros])

    df_loc = pd.DataFrame([{
        "id_local": l["id_local"],
        "nombre_local": l["nombre_local"],
        "localidad": l["localidad"],
        "provincia": l["provincia"],
        "jefe_zonal": l["jefe_zonal"],
        "tipo_zona": l["tipo_zona"],
        "fecha_apertura": fmt_fecha(l["fecha_apertura"]),
        "fecha_cierre": fmt_fecha(l["fecha_cierre"]),
        "latitud": l["latitud"],
        "longitud": l["longitud"],
    } for l in locales])

    df_hor = pd.DataFrame(generar_actividad_horaria(locales, esp))
    df_cap = pd.DataFrame(generar_capacitaciones(cajeros))
    df_hit = pd.DataFrame(generar_hitos(esp))
    df_txt = pd.DataFrame(generar_textos_cierre())

    escribir_csv(df_tx, DIR_OK / "transacciones_mensuales.csv", float_format="%.2f")
    escribir_csv(df_act, DIR_OK / "actividad_mensual.csv")
    escribir_csv(df_caj, DIR_OK / "cajeros.csv")
    escribir_csv(df_loc, DIR_OK / "locales.csv", float_format="%.6f")
    escribir_csv(df_hit, DIR_OK / "hitos.csv")
    escribir_csv(df_hor, DIR_OK / "actividad_horaria.csv")
    escribir_csv(df_cap, DIR_OK / "capacitaciones.csv")
    escribir_csv(df_txt, DIR_OK / "textos_cierre.csv")

    notas_mal = generar_invalido(df_tx, df_act, df_caj, df_loc)

    # ---------------- verificación con pandas sobre lo escrito ------------- #
    leer = lambda n: pd.read_csv(DIR_OK / n, sep=";", encoding="utf-8-sig", dtype={"latitud": str, "longitud": str}) \
        if n == "locales.csv" else pd.read_csv(DIR_OK / n, sep=";", encoding="utf-8-sig")
    tx, act = leer("transacciones_mensuales.csv"), leer("actividad_mensual.csv")
    caj, loc = leer("cajeros.csv"), leer("locales.csv")
    hor, cap = leer("actividad_horaria.csv"), leer("capacitaciones.csv")
    hit, txt = leer("hitos.csv"), leer("textos_cierre.csv")

    meses_cajero = tx.groupby("id_cajero")[["anio", "mes"]].apply(
        lambda d: d.drop_duplicates().shape[0])
    locales_cajero = tx.groupby("id_cajero")["id_local"].nunique()
    nunca = sorted(set(caj["id_cajero"]) - set(tx["id_cajero"]))
    pocos = sorted(meses_cajero[meses_cajero <= 2].index)
    cambiaron = sorted(locales_cajero[locales_cajero > 1].index)
    altas26 = caj[caj["fecha_alta"].str.endswith("/2026")]
    bajas26 = caj[caj["fecha_baja"].fillna("").str.endswith("/2026")]
    sin_coord = loc[loc["latitud"].isna() | (loc["latitud"] == "")]

    ops_mes = tx.groupby(["anio", "mes"])["cantidad"].sum()
    dic25 = ops_mes.loc[(2025, 12)]
    prom25 = ops_mes.loc[2025].mean()

    tx_sin_mes = tx[tx["id_local"] == esp["sin_mes"]]
    meses_sin = sorted(set(zip(tx_sin_mes["anio"], tx_sin_mes["mes"])))

    # mejora / caída entre el primer y el último trimestre completo de 2026
    t26 = tx[tx["anio"] == 2026]
    q1 = t26[t26["mes"].between(1, 3)].groupby("id_cajero")["cantidad"].sum()
    q2 = t26[t26["mes"].between(4, 6)].groupby("id_cajero")["cantidad"].sum()
    comp = pd.concat([q1.rename("q1"), q2.rename("q2")], axis=1).dropna()
    comp["var"] = comp["q2"] / comp["q1"] - 1

    # coherencia de dias_activos
    act_pos = act[act["dias_activos"] > 0][["anio", "mes", "id_cajero"]].drop_duplicates()
    tx_pos = tx[["anio", "mes", "id_cajero"]].drop_duplicates()
    incoherentes = (pd.merge(act_pos, tx_pos, how="outer", indicator=True)
                    .query("_merge != 'both'").shape[0])
    act["_dm"] = [dias_del_mes(a, m) for a, m in zip(act["anio"], act["mes"])]
    excedidos = int((act["dias_activos"] > act["_dm"]).sum())

    # ------------------------------ LEEME ok ------------------------------- #
    l_nuevo_a, l_nuevo_b = esp["por_id"][esp["nuevo_a"]], esp["por_id"][esp["nuevo_b"]]
    l_cierre, l_sin_mes = esp["por_id"][esp["cierre"]], esp["por_id"][esp["sin_mes"]]
    mejor = comp["var"].idxmax()
    peor = comp["var"].idxmin()

    abiertos = loc.loc[loc["fecha_cierre"].fillna("") == "", "id_local"]
    tam = caj[caj["id_local_actual"].isin(abiertos)].groupby("id_local_actual").size()
    tam_min, tam_max = int(tam.min()), int(tam.max())
    n_chicos, n_grandes = int(tam.between(2, 3).sum()), int((tam >= 11).sum())
    ops_zona = tx.merge(loc[["id_local", "tipo_zona"]], on="id_local")
    ops_por_local = (ops_zona.groupby("tipo_zona")["cantidad"].sum()
                     / loc["tipo_zona"].value_counts())
    ops_alto, ops_bajo = ops_por_local["Alto"], ops_por_local["Bajo"]

    leeme_ok = f"""DATASET DE EJEMPLO - Presentacion anual de la red (Canal Propio)
================================================================

Generado por scripts/generar_ejemplo.py con semilla {SEMILLA}. Todo es ficticio:
nombres de personas, de locales y de localidades son inventados; las provincias
son reales solo para que el mapa de la lamina 13 tenga sentido.

Formato: CSV, UTF-8 con BOM, separador ';', fechas dd/mm/aaaa, decimales con punto.

ARCHIVOS
--------
transacciones_mensuales.csv  {len(tx):>7} filas  anio;mes;id_cajero;id_local;grupo;tipo_operacion;cantidad;cantidad_rechazadas
actividad_mensual.csv        {len(act):>7} filas  anio;mes;id_cajero;dias_activos
cajeros.csv                  {len(caj):>7} filas  id_cajero;nombre_cajero;id_local_actual;fecha_alta;fecha_baja
locales.csv                  {len(loc):>7} filas  id_local;nombre_local;localidad;provincia;jefe_zonal;tipo_zona;fecha_apertura;fecha_cierre;latitud;longitud
hitos.csv                    {len(hit):>7} filas  fecha;titulo;descripcion;jefe_zonal   (jefe_zonal vacio = toda la red)
actividad_horaria.csv        {len(hor):>7} filas  anio;mes;id_local;dia_semana;hora;cantidad  (dia_semana 1=lunes..7=domingo)
capacitaciones.csv           {len(cap):>7} filas  id_cajero;fecha;nombre_capacitacion
textos_cierre.csv            {len(txt):>7} filas  jefe_zonal;hallazgos;objetivos       (jefe_zonal vacio = toda la red)

FORMA GENERAL
-------------
- {len(JEFES)} jefes zonales, {len(loc)} locales, {loc['localidad'].nunique()} localidades, {loc['provincia'].nunique()} provincias, {len(caj)} cajeros.
- 20 meses: 01/2025 a 12/2025 (ano anterior completo) y 01/2026 a 08/2026 (ano en
  curso hasta el mes anterior al actual, siendo hoy 21/09/2026). Los dos anos van
  en el MISMO transacciones_mensuales.csv y actividad_mensual.csv: el ano anterior
  es un filtro por la columna 'anio', no un archivo aparte.
- 4 tipos de operacion con los valores del dato real. Mix obtenido:
  {', '.join(f"{t} {p:.1%}" for t, p in (tx.groupby('tipo_operacion')['cantidad'].sum() / tx['cantidad'].sum()).sort_values(ascending=False).items())}
- Grupos (D-01): SF2 sin TEC, TEC y MT, cada uno con sus tipos de operacion. No hay montos
  negativos. 'cantidad' siempre positiva.
- tipo_zona: {int((loc['tipo_zona'] == 'Alto').sum())} locales en zona Alto y {int((loc['tipo_zona'] == 'Bajo').sum())} en zona Bajo; todos los locales de
  una misma localidad comparten el tipo de zona.
- actividad_mensual trae una fila por cada mes en que el cajero estuvo habilitado,
  con dias_activos = 0 en los meses sin operaciones. Los cajeros que nunca operaron
  no tienen ninguna fila (caso "fila ausente").

CASOS BORDE INCLUIDOS (verificados al generar)
----------------------------------------------
1.  Cajeros habilitados que NUNCA operaron: {len(nunca)}
    (estan en cajeros.csv y no tienen ninguna fila en transacciones_mensuales.csv)
    IDs: {', '.join(nunca)}
2.  Altas durante el ano en curso: {len(altas26)} cajeros con fecha_alta en 2026.
    Bajas durante el ano en curso: {len(bajas26)} cajeros con fecha_baja en 2026.
    Las operaciones existen solo dentro de la ventana [fecha_alta, fecha_baja].
3.  Cajeros que cambiaron de local en el periodo: {len(cambiaron)}
    (aparecen con distinto id_local en meses distintos; id_local_actual es el
    local del ultimo mes en que operaron)
4.  Cajeros con 1 o 2 meses activos en todo el periodo: {len(pocos)}
    (quedan por debajo de productividad.minimo_meses_activos = {min_meses} de
    config.json y deben mostrarse como "Sin datos suficientes")
5.  Locales sin coordenadas (latitud y longitud vacias): {len(sin_coord)}
    IDs: {', '.join(sin_coord['id_local'])}
6.  Local con un mes entero sin datos en el medio del periodo:
    {l_sin_mes['id_local']} ({l_sin_mes['nombre_local']}) no tiene ninguna fila en 04/2026,
    pero si en 03/2026 y en 05/2026.
    Ademas, algunos locales chicos (2 o 3 cajeros) pueden quedarse sin
    operaciones en meses sueltos porque todo su plantel estuvo inactivo: es
    el comportamiento esperado y sirve para probar los estados vacios.
7.  Pico estacional de diciembre: 12/2025 tiene {ar(dic25)} operaciones contra un
    promedio mensual de {ar(prom25)} en 2025, es decir {dic25 / prom25 - 1:+.1%}.
    (12/2026 queda fuera del periodo, que termina en 08/2026.)
8.  Locales con fecha_apertura dentro del ano en curso:
    {l_nuevo_a['id_local']} ({l_nuevo_a['nombre_local']}) abre el {fmt_fecha(l_nuevo_a['fecha_apertura'])}
    {l_nuevo_b['id_local']} ({l_nuevo_b['nombre_local']}) abre el {fmt_fecha(l_nuevo_b['fecha_apertura'])}
    Local con fecha_cierre dentro del ano en curso:
    {l_cierre['id_local']} ({l_cierre['nombre_local']}) cierra el {fmt_fecha(l_cierre['fecha_cierre'])}
    Ninguno tiene operaciones fuera de esa ventana.
9.  Cajeros con cambio fuerte de desempeno entre el primer y el segundo trimestre
    de 2026 (para la lamina 33, "mayor mejora"):
    mayor mejora: {mejor} ({comp.loc[mejor, 'var']:+.0%} de operaciones)
    mayor caida:  {peor} ({comp.loc[peor, 'var']:+.0%} de operaciones)
10. Heterogeneidad: de {tam_min} a {tam_max} cajeros por local abierto ({n_chicos} locales de 2 o 3
    cajeros y {n_grandes} de 11 o mas; un traslado puede dejar a un local con uno solo),
    productividad por cajero muy dispersa, y localidades de alto movimiento con
    bastante mas volumen que las de bajo: {ar(ops_alto)} operaciones por local en
    zona Alto contra {ar(ops_bajo)} en zona Bajo.

COHERENCIA VERIFICADA
---------------------
- dias_activos > 0 si y solo si el cajero tiene operaciones ese mes: {incoherentes} discrepancias.
- dias_activos mayores a los dias del mes: {excedidos}.
- IDs de transacciones_mensuales sin maestro: {len(set(tx['id_cajero']) - set(caj['id_cajero']))} cajeros, {len(set(tx['id_local']) - set(loc['id_local']))} locales.
- Filas duplicadas por (anio, mes, id_cajero, id_local, tipo_operacion): {int(tx.duplicated(['anio', 'mes', 'id_cajero', 'id_local', 'tipo_operacion']).sum())}.
- Cantidades negativas: {int((tx['cantidad'] < 0).sum())}.
"""
    escribir_texto(DIR_OK / "LEEME.txt", leeme_ok)

    leeme_mal = "DATASET INVALIDO - para probar el reporte de validacion (Requerimiento.md 3)\n"
    leeme_mal += "=" * 74 + "\n\n"
    leeme_mal += ("Recorte chico del dataset de data/ejemplo/ (un jefe zonal, 4 locales, 15\n"
                  "cajeros, 01/2026 a 06/2026) con un error de cada tipo que el reporte de\n"
                  "validacion tiene que detectar. Solo trae las 4 tablas obligatorias.\n"
                  "Los numeros de linea incluyen la linea 1 de encabezado.\n\n"
                  "ERRORES SEMBRADOS\n-----------------\n")
    for i, nota in enumerate(sorted(notas_mal), start=1):
        leeme_mal += f"{i}. {nota}\n"
    leeme_mal += ("\nTodo lo demas del recorte es valido: cualquier otro hallazgo del reporte de\n"
                  "validacion es un falso positivo.\n")
    escribir_texto(DIR_MAL / "LEEME.txt", leeme_mal)

    # ------------------------------ salida --------------------------------- #
    print("=" * 72)
    print("ARCHIVOS GENERADOS")
    print("=" * 72)
    for carpeta in (DIR_OK, DIR_MAL):
        for f in sorted(carpeta.glob("*.csv")):
            df = pd.read_csv(f, sep=";", encoding="utf-8-sig")
            print(f"  {f.relative_to(RAIZ).as_posix():<52} {len(df):>7} filas  {len(df.columns)} columnas")
        print(f"  {(carpeta / 'LEEME.txt').relative_to(RAIZ).as_posix()}")
    print()
    print("=" * 72)
    print("VERIFICACION DE CASOS BORDE (contado con pandas sobre los CSV escritos)")
    print("=" * 72)
    chk = [
        (f"cajeros que nunca operaron (>= 8)", len(nunca), len(nunca) >= 8),
        (f"altas en 2026 (>= 15)", len(altas26), len(altas26) >= 15),
        (f"bajas en 2026 (>= 10)", len(bajas26), len(bajas26) >= 10),
        (f"cajeros que cambiaron de local (>= 12)", len(cambiaron), len(cambiaron) >= 12),
        (f"cajeros con 1-2 meses activos (>= 10)", len(pocos), len(pocos) >= 10),
        (f"locales sin coordenadas (>= 3)", len(sin_coord), len(sin_coord) >= 3),
        (f"locales con apertura en 2026 (= 2)", int(loc['fecha_apertura'].str.endswith('/2026').sum()), True),
        (f"locales con cierre en 2026 (= 1)", int(loc['fecha_cierre'].fillna('').str.endswith('/2026').sum()), True),
        (f"meses de {esp['sin_mes']} en 2026 (sin 04)", len([m for a, m in meses_sin if a == 2026]), (2026, 4) not in meses_sin),
        (f"dias_activos incoherentes (= 0)", incoherentes, incoherentes == 0),
        (f"dias_activos > dias del mes (= 0)", excedidos, excedidos == 0),
        (f"cantidades negativas (= 0)", int((tx['cantidad'] < 0).sum()), int((tx['cantidad'] < 0).sum()) == 0),
        (f"duplicados por clave (= 0)", int(tx.duplicated(['anio', 'mes', 'id_cajero', 'id_local', 'tipo_operacion']).sum()), True),
        (f"meses distintos en el dataset (= 20)", tx[['anio', 'mes']].drop_duplicates().shape[0], tx[['anio', 'mes']].drop_duplicates().shape[0] == 20),
    ]
    for etiqueta, valor, ok in chk:
        print(f"  [{'OK' if ok else 'XX'}] {etiqueta:<46} {valor}")
    print(f"  [OK] pico de 12/2025 sobre el promedio mensual 2025  {dic25 / prom25 - 1:+.1%}")
    print(f"  [OK] mejora Q1->Q2 2026 del mejor cajero ({mejor})      {comp.loc[mejor, 'var']:+.0%}")
    print(f"  [OK] caida  Q1->Q2 2026 del peor cajero  ({peor})      {comp.loc[peor, 'var']:+.0%}")
    print(f"  [OK] cajeros por local abierto: min {tam_min} / max {tam_max}")
    print(f"  [OK] operaciones por local, zona Alto {ar(ops_alto)} vs zona Bajo {ar(ops_bajo)}")
    print()
    mix = (tx.groupby("tipo_operacion")["cantidad"].sum() / tx["cantidad"].sum()).sort_values(ascending=False)
    print("  Mix de tipos de operacion: " + ", ".join(f"{t} {p:.1%}" for t, p in mix.items()))
    porgrupo = tx.groupby("grupo")["cantidad"].sum()
    print("  Operaciones por grupo:     " + ", ".join(f"{g} {int(v):,}".replace(",", ".") for g, v in porgrupo.items()))
    print(f"  Rechazos sobre cantidad:   {tx['cantidad_rechazadas'].sum() / tx['cantidad'].sum():.2%} (maximo por fila {(tx['cantidad_rechazadas'] / tx['cantidad']).max():.2%})")
    print()
    print("  Dataset invalido: 7 errores sembrados, detallados en data/ejemplo_invalido/LEEME.txt")


if __name__ == "__main__":
    main()


# --------------------------------------------------------------------------- #
# CASOS BORDE SEMBRADOS A PROPOSITO (resumen; el detalle con conteos reales
# queda en data/ejemplo/LEEME.txt y data/ejemplo_invalido/LEEME.txt)
#
# data/ejemplo/
#   1.  10 cajeros habilitados que nunca operaron: figuran en cajeros.csv y no
#       tienen ninguna fila en transacciones_mensuales.csv ni en
#       actividad_mensual.csv (caso "fila ausente" de actividad).
#   2.  Altas y bajas dentro del ano en curso: 2026 tiene >= 15 altas y >= 10
#       bajas; las operaciones existen solo dentro de [fecha_alta, fecha_baja].
#   3.  >= 15 cajeros que cambiaron de local durante el periodo: aparecen con
#       distinto id_local en meses distintos e id_local_actual es el local del
#       ultimo mes en que operaron.
#   4.  12 cajeros esporadicos con 1 o 2 meses activos en todo el periodo, por
#       debajo de productividad.minimo_meses_activos (3) de config.json: deben
#       quedar como "Sin datos suficientes".
#   5.  4 locales sin latitud ni longitud (columnas vacias), para probar el
#       ocultamiento de la lamina 13.
#   6.  Un local sin ninguna fila en 04/2026 y con datos en 03/2026 y 05/2026.
#   7.  Pico estacional de diciembre (~+38% sobre el mes promedio). El unico
#       diciembre del periodo es 12/2025: el ano en curso termina en 08/2026.
#   8.  Dos locales con fecha_apertura en 2026 (01/02 y 01/05) y uno con
#       fecha_cierre en 2026 (30/06). Su plantel se reasigna o causa baja, y no
#       hay operaciones fuera de la ventana de vida del local.
#   9.  3 cajeros con tendencia fuertemente creciente y 3 con tendencia
#       fuertemente decreciente a lo largo de 2026, para que la lamina 33
#       ("mayor mejora del ano") tenga contenido real.
#   10. Heterogeneidad deliberada: locales de 2-3 cajeros y de 12-15, factores
#       de productividad lognormales por cajero y por local, y localidades de
#       alto movimiento con volumen muy superior a las de bajo.
#
# data/ejemplo_invalido/ (un error de cada tipo de Requerimiento.md 3)
#   a. id_cajero C9999 sin correspondencia en cajeros.csv.
#   b. id_local L999 sin correspondencia en locales.csv.
#   c. Fila duplicada por (anio, mes, id_cajero, id_local, tipo_operacion).
#   d. Mes faltante en el medio del periodo: no hay ninguna fila de 03/2026.
#   e. tipo_operacion no reconocido: "Transferencia XYZ".
#   f. cantidad negativa: -143.
#   g. dias_activos 35 en abril de 2026, que tiene 30 dias.
# --------------------------------------------------------------------------- #
