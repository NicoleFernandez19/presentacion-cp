"""Trae los datos directo de SQL Server y los deja en data/entrada/.

    python scripts/extraer_datos.py
    python scripts/extraer_datos.py --desde 20250100
    python scripts/extraer_datos.py --solo-probar

Es el camino normal: no necesita que el Dashboard Canal Propio esté instalado ni
que su pipeline haya corrido. Lo único que sí sigue viniendo de un archivo es la
asignación de locales a jefes zonales (`data/maestros/zonales.csv`), porque no
existe en la base: se mantiene a mano.

Las tres agrupaciones de la presentación (D-01) salen de dos queries:

    scripts/sql/sf2.sql   ->  grupos "SF2 sin TEC" y "TEC", según el paycode
    scripts/sql/mt.sql    ->  grupo "MT"

Conexión: `conexion.ini` en la raíz del proyecto. Si no está, se usa el
`config.ini` del Dashboard Canal Propio, que tiene las mismas credenciales — así
no hay que duplicar la contraseña en dos archivos. Ver `conexion.ejemplo.ini`.
"""

from __future__ import annotations

import argparse
import configparser
import json
import sys
import time
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parent.parent
SQL = Path(__file__).resolve().parent / "sql"

CONFIG_RESPALDO = Path(
    r"C:\Users\W0029557\OneDrive - Western Union"
    r"\Operaciones Argentina I+D - Documents\Workspace\CANAL PROPIO\Dashboard Canal Propio\config.ini"
)

DRIVERS_PREFERIDOS = [
    "ODBC Driver 18 for SQL Server",
    "ODBC Driver 17 for SQL Server",
    "SQL Server Native Client 11.0",
    "SQL Server",
]


def leer_conexion(ruta_explicita: str | None) -> dict:
    candidatas = [Path(ruta_explicita)] if ruta_explicita else [RAIZ / "conexion.ini", CONFIG_RESPALDO]
    for ruta in candidatas:
        if ruta.exists():
            cfg = configparser.ConfigParser()
            cfg.read(ruta, encoding="utf-8")
            if "sqlserver" not in cfg:
                continue
            datos = dict(cfg["sqlserver"])
            datos["_origen"] = str(ruta)
            return datos
    raise SystemExit(
        "No se encontró la configuración de conexión. Copiá conexion.ejemplo.ini a "
        "conexion.ini y completá los datos del servidor."
    )


def conectar(cfg: dict):
    """pyodbc con la cadena de drivers instalados; pymssql si ninguno sirve."""
    ultimo_error = None
    try:
        import pyodbc

        instalados = set(pyodbc.drivers())
        orden = [cfg.get("driver")] + [d for d in DRIVERS_PREFERIDOS if d != cfg.get("driver")]
        for driver in orden:
            if not driver or driver not in instalados:
                continue
            cadena = (
                f"DRIVER={{{driver}}};SERVER={cfg['server']};DATABASE={cfg['database']};"
                f"UID={cfg['username']};PWD={cfg['password']};"
            )
            if "18" in driver:
                cadena += "Encrypt=yes;TrustServerCertificate=yes;"
            try:
                conexion = pyodbc.connect(cadena, timeout=20)
                conexion.timeout = 900
                if driver == "SQL Server":
                    print(
                        "ADVERTENCIA: se está usando el driver heredado «SQL Server».\n"
                        "             Conviene instalar https://aka.ms/odbc18 en esta máquina."
                    )
                return conexion, f"pyodbc / {driver}"
            except Exception as error:  # noqa: BLE001
                ultimo_error = error
    except ImportError:
        ultimo_error = "pyodbc no está instalado"

    try:
        import pymssql

        conexion = pymssql.connect(
            server=cfg["server"],
            user=cfg["username"],
            password=cfg["password"],
            database=cfg["database"],
            timeout=900,
            login_timeout=30,
        )
        return conexion, "pymssql"
    except Exception as error:  # noqa: BLE001
        raise SystemExit(f"No se pudo conectar a SQL Server. Último error: {error}\nAnterior: {ultimo_error}")


def consultar(conexion, nombre: str, desde: int) -> pd.DataFrame:
    sql = (SQL / f"{nombre}.sql").read_text(encoding="utf-8").replace("{desde}", str(desde))
    inicio = time.time()
    df = pd.read_sql(sql, conexion)
    print(f"  {nombre}: {len(df):,} filas en {time.time() - inicio:,.0f} s".replace(",", "."))
    return df


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrae los datos de SQL Server para la presentación.")
    parser.add_argument("--desde", type=int, default=20260100, help="piso de fecha (aaaammdd), por defecto 20260100")
    parser.add_argument("--conexion", type=str, default=None, help="ruta de un .ini de conexión alternativo")
    parser.add_argument("--destino", type=str, default=str(RAIZ / "data" / "entrada"))
    parser.add_argument("--zonales", type=str, default=str(RAIZ / "data" / "maestros" / "zonales.csv"))
    parser.add_argument("--solo-probar", action="store_true", help="solo prueba la conexión y sale")
    argumentos = parser.parse_args()

    config = json.loads((RAIZ / "config.json").read_text(encoding="utf-8"))
    cfg = leer_conexion(argumentos.conexion)
    print(f"Conexión: {cfg['server']}/{cfg['database']} (según {cfg['_origen']})")

    conexion, como = conectar(cfg)
    print(f"Conectado con {como}")
    if argumentos.solo_probar:
        conexion.close()
        return 0

    try:
        sf2 = consultar(conexion, "sf2", argumentos.desde)
        mt = consultar(conexion, "mt", argumentos.desde)
    finally:
        conexion.close()

    crudo = pd.concat([sf2, mt], ignore_index=True)
    crudo.columns = [c.strip() for c in crudo.columns]
    crudo["Periodo"] = pd.to_numeric(crudo["Periodo"], errors="coerce").astype("Int64")
    crudo["Txs"] = pd.to_numeric(crudo["Txs"], errors="coerce").fillna(0)
    for columna in ("IdLocal", "Legajo", "Usuario", "Local", "Grupo", "TipoOperacion"):
        crudo[columna] = crudo[columna].astype(str).str.strip()
    crudo = crudo[(crudo["Legajo"] != "") & (crudo["IdLocal"] != "") & crudo["Periodo"].notna()]

    # El maestro de zonales no está en la base: se mantiene a mano.
    ruta_zonales = Path(argumentos.zonales)
    if ruta_zonales.exists():
        zonales = pd.read_csv(ruta_zonales, dtype=str, keep_default_na=False)
        zonales.columns = [c.strip() for c in zonales.columns]
        zonales["ID AGENTE"] = zonales["ID AGENTE"].astype(str).str.strip()
        zonales = zonales[zonales["ID AGENTE"] != ""].drop_duplicates(subset=["ID AGENTE"], keep="last")
        indice = zonales.set_index("ID AGENTE")
        crudo["JEFE ZONAL"] = [indice["JEFE ZONAL"].get(i, "").strip() for i in crudo["IdLocal"]]
        crudo["PROVINCIA"] = [indice["PROVINCIA"].get(i, "").strip() for i in crudo["IdLocal"]]
        if "REGION" in indice:
            crudo["REGION"] = [indice["REGION"].get(i, "").strip() for i in crudo["IdLocal"]]
        else:
            crudo["REGION"] = ""
        crudo["NOM_LOCAL"] = [
            indice["NOM_LOCAL"].get(i, "").strip() or n for i, n in zip(crudo["IdLocal"], crudo["Local"])
        ]
        sin_zonal = int((crudo["JEFE ZONAL"] == "").sum())
        if sin_zonal:
            print(f"  AVISO: {sin_zonal} filas de locales que no están en el maestro de zonales")
    else:
        print(f"  AVISO: no se encontró {ruta_zonales}; los locales quedan sin jefe zonal")
        crudo["JEFE ZONAL"] = ""
        crudo["PROVINCIA"] = ""
        crudo["REGION"] = ""
        crudo["NOM_LOCAL"] = crudo["Local"]

    crudo = crudo.rename(columns={"IdLocal": "Id Local", "TipoOperacion": "tipo_operacion", "Grupo": "grupo"})
    crudo["anio"] = crudo["Periodo"] // 100
    crudo["mes"] = crudo["Periodo"] % 100

    tx = (
        crudo.groupby(["anio", "mes", "Legajo", "Id Local", "grupo", "tipo_operacion"], as_index=False)
        .agg(cantidad=("Txs", "sum"))
        .rename(columns={"Legajo": "id_cajero", "Id Local": "id_local"})
    )
    tx["cantidad"] = tx["cantidad"].astype(int)
    tx = tx[["anio", "mes", "id_cajero", "id_local", "grupo", "tipo_operacion", "cantidad"]]

    # Reusa el armado de locales y cajeros del importador: mismo criterio, un solo lugar.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from importar_canal_propio import escribir_entrada  # noqa: E402

    resumen = escribir_entrada(tx, crudo, Path(argumentos.destino), config)

    print(f"Destino: {argumentos.destino}")
    print(f"  transacciones_mensuales: {len(tx):,} filas".replace(",", "."))
    print(f"  locales: {resumen['locales']}   cajeros: {resumen['cajeros']}")
    print(f"  períodos: {int(crudo['Periodo'].min())} a {resumen['ultimo_periodo']}")
    for grupo, sub in tx.groupby("grupo"):
        tipos = ", ".join(sorted(sub["tipo_operacion"].unique()))
        print(f"  {grupo}: {sub['cantidad'].sum():,} operaciones — {tipos}".replace(",", "."))
    print("\nAhora: python scripts/preparar_datos.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
