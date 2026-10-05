"""Traduce los datos del proyecto Dashboard Canal Propio al esquema de entrada
que define Requerimiento.md §3 (más la columna `grupo`, ver D-01), y los deja en
data/entrada/.

    python scripts/importar_canal_propio.py
    python scripts/importar_canal_propio.py --origen "D:\\ruta\\Dashboard Canal Propio"

Es el camino de respaldo: lo normal es traer los datos directo de SQL Server con
`scripts/extraer_datos.py`, que no depende de que el dashboard esté instalado.
Este script sirve cuando no hay acceso a la base pero sí a la carpeta.

Fuentes y grupos (D-01):

| Grupo        | Fuente                          | Recorte                |
|--------------|---------------------------------|------------------------|
| SF2 sin TEC  | consolidado_transacciones.csv   | EsTEC = 0              |
| TEC          | consolidado_transacciones.csv   | EsTEC = 1 (paycode E0O)|
| MT           | consolidado_wupos.csv           | todo                   |

El tipo de operación de cada grupo sale de su propia columna: `Grupo` en SF2
(SF2 Positivo, Positivo Debito, Positivo QR, Negativos, Otro TipoOpe) y
`TipoOperacion` en MT (Envíos, Pagos).

Los supuestos que hacen falta porque el dato real no los trae están en
DECISIONES.md: D-07 (localidad derivada del nombre), D-08 (altas y bajas
inferidas), D-09 (identidad por legajo).
"""

from __future__ import annotations

import argparse
import calendar
import json
import sys
from datetime import date
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

ORIGEN_POR_DEFECTO = Path(
    r"C:\Users\W0029557\OneDrive - Western Union"
    r"\Operaciones Argentina I+D - Documents\Workspace\CANAL PROPIO\Dashboard Canal Propio"
)


def normalizar_localidad(nombre: str, config: dict) -> str:
    texto = (nombre or "").strip().upper()
    for prefijo in config["datos"]["prefijos_local_a_quitar"]:
        if texto.startswith(prefijo.upper()):
            texto = texto[len(prefijo) :].strip()
    partes = texto.split()
    sufijos = {s.upper() for s in config["datos"]["sufijos_local_a_quitar"]}
    while partes and (partes[-1] in sufijos or partes[-1].isdigit()):
        partes.pop()
    return " ".join(partes) if partes else texto


def fecha_str(valor: date) -> str:
    return valor.strftime("%d/%m/%Y")


def leer(ruta: Path) -> pd.DataFrame:
    if not ruta.exists():
        raise SystemExit(f"No se encontró {ruta}")
    df = pd.read_csv(ruta, dtype=str, keep_default_na=False)
    df["Periodo"] = pd.to_numeric(df["Periodo"], errors="coerce")
    df["Txs"] = pd.to_numeric(df["Txs"], errors="coerce").fillna(0)
    df = df[df["Periodo"].notna()].copy()
    df["Periodo"] = df["Periodo"].astype(int)
    for columna in ("Legajo", "Id Local"):
        df[columna] = df[columna].astype(str).str.strip()
    return df[(df["Legajo"] != "") & (df["Id Local"] != "")]


def escribir_entrada(tx: pd.DataFrame, maestro: pd.DataFrame, destino: Path, config: dict) -> dict:
    """tx: anio, mes, id_cajero, id_local, grupo, tipo_operacion, cantidad.
    maestro: filas crudas con Id Local, NOM_LOCAL, JEFE ZONAL, PROVINCIA, Legajo, Usuario, Periodo."""
    separador = config["datos"]["separador_csv"]

    # --- locales
    # region: agrupador exógeno para el grupo de pares (D-27). Si la fuente no la
    # trae, queda vacía y preparar_datos.py cae a provincia.
    if "REGION" not in maestro:
        # La región es el grupo de pares de D-27: si falta, el criterio cae a
        # provincia y nadie se entera. Que se vea.
        print("  AVISO: la fuente no trae REGION; los locales quedan sin región y el grupo")
        print("         de pares de D-27 cae a provincia. Revisar la lista de columnas.")
        maestro = maestro.assign(REGION="")
    locales = (
        maestro.sort_values("Periodo")
        .groupby("Id Local")
        .agg(
            nombre_local=("NOM_LOCAL", "last"),
            provincia=("PROVINCIA", "last"),
            region=("REGION", "last"),
            jefe_zonal=("JEFE ZONAL", "last"),
        )
        .reset_index()
        .rename(columns={"Id Local": "id_local"})
    )
    locales["nombre_local"] = [
        (n or "").strip() or f"Local {i}" for n, i in zip(locales["nombre_local"], locales["id_local"])
    ]
    locales["jefe_zonal"] = [(j or "").strip() or "Sin asignar" for j in locales["jefe_zonal"]]
    locales["provincia"] = [(p or "").strip() for p in locales["provincia"]]
    locales["region"] = [(r or "").strip() for r in locales["region"]]
    locales["localidad"] = [normalizar_localidad(n, config) for n in locales["nombre_local"]]
    # tipo_zona vacío a propósito: lo calcula preparar_datos.py con el criterio de §4.5
    for columna in ("tipo_zona", "fecha_apertura", "fecha_cierre", "latitud", "longitud"):
        locales[columna] = ""
    locales = locales[
        ["id_local", "nombre_local", "localidad", "provincia", "region", "jefe_zonal",
         "tipo_zona", "fecha_apertura", "fecha_cierre", "latitud", "longitud"]
    ]

    # --- cajeros: identidad por legajo, nombre y local del período más reciente (D-09)
    ultimo_periodo = int(maestro["Periodo"].max())
    orden = maestro.sort_values(["Legajo", "Periodo", "Txs"])
    ultimo = orden.groupby("Legajo").tail(1).set_index("Legajo")
    primeros = maestro.groupby("Legajo")["Periodo"].min()
    ultimos = maestro.groupby("Legajo")["Periodo"].max()

    filas = []
    for legajo in sorted(maestro["Legajo"].unique()):
        primero = int(primeros[legajo])
        suyo = int(ultimos[legajo])
        if suyo >= ultimo_periodo:
            baja = ""
        else:
            anio, mes = suyo // 100, suyo % 100
            baja = fecha_str(date(anio, mes, calendar.monthrange(anio, mes)[1]))
        filas.append(
            {
                "id_cajero": legajo,
                "nombre_cajero": (ultimo.loc[legajo, "Usuario"] or "").strip() or legajo,
                "id_local_actual": ultimo.loc[legajo, "Id Local"],
                "fecha_alta": fecha_str(date(primero // 100, primero % 100, 1)),
                "fecha_baja": baja,
            }
        )
    cajeros = pd.DataFrame(filas)

    destino.mkdir(parents=True, exist_ok=True)
    for nombre, df in (("transacciones_mensuales", tx), ("locales", locales), ("cajeros", cajeros)):
        df.to_csv(destino / f"{nombre}.csv", sep=separador, index=False, encoding="utf-8-sig")

    return {"locales": len(locales), "cajeros": len(cajeros), "ultimo_periodo": ultimo_periodo}


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa los datos del Dashboard Canal Propio.")
    parser.add_argument("--origen", type=str, default=str(ORIGEN_POR_DEFECTO))
    parser.add_argument("--destino", type=str, default=str(RAIZ / "data" / "entrada"))
    argumentos = parser.parse_args()

    origen = Path(argumentos.origen)
    destino = Path(argumentos.destino)
    config = json.loads((RAIZ / "config.json").read_text(encoding="utf-8"))

    consolidado = origen / "Data" / "consolidado"
    sf2 = leer(consolidado / "consolidado_transacciones.csv")
    mt = leer(consolidado / "consolidado_wupos.csv")

    sf2["grupo"] = ["TEC" if str(v).strip() == "1" else "SF2 sin TEC" for v in sf2["EsTEC"]]
    sf2["tipo_operacion"] = sf2["Grupo"].str.strip()
    mt["grupo"] = "MT"
    mt["tipo_operacion"] = mt["TipoOperacion"].str.strip()

    columnas = ["Periodo", "Id Local", "Legajo", "Usuario", "grupo", "tipo_operacion", "Txs",
                "JEFE ZONAL", "REGION", "PROVINCIA", "NOM_LOCAL"]
    juntos = pd.concat([sf2[columnas], mt[columnas]], ignore_index=True)
    juntos["anio"] = juntos["Periodo"] // 100
    juntos["mes"] = juntos["Periodo"] % 100

    tx = (
        juntos.groupby(["anio", "mes", "Legajo", "Id Local", "grupo", "tipo_operacion"], as_index=False)
        .agg(cantidad=("Txs", "sum"))
        .rename(columns={"Legajo": "id_cajero", "Id Local": "id_local"})
    )
    tx["cantidad"] = tx["cantidad"].astype(int)
    tx = tx[["anio", "mes", "id_cajero", "id_local", "grupo", "tipo_operacion", "cantidad"]]

    resumen = escribir_entrada(tx, juntos, destino, config)

    print(f"Origen: {consolidado}")
    print(f"Destino: {destino}")
    print(f"  transacciones_mensuales: {len(tx):,} filas".replace(",", "."))
    print(f"  locales: {resumen['locales']}   cajeros: {resumen['cajeros']}")
    print(f"  períodos: {int(juntos['Periodo'].min())} a {resumen['ultimo_periodo']}")
    for grupo, sub in tx.groupby("grupo"):
        tipos = ", ".join(sorted(sub["tipo_operacion"].unique()))
        print(f"  {grupo}: {sub['cantidad'].sum():,} operaciones — {tipos}".replace(",", "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
