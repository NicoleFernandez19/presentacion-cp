-- Cobranzas SF2 por operador, con el paycode TEC separado del resto.
--
-- De acá salen dos de los tres grupos de la presentación (D-01):
--   EsTEC = 1  -> grupo "TEC"          (paycode E0O, Todo en Cuotas desembolsos)
--   EsTEC = 0  -> grupo "SF2 sin TEC"  (todos los demás paycodes)
--
-- El tipo de operación sale de Id_TipoOpe, con el mismo criterio que ya usa el
-- pipeline del Dashboard Canal Propio: 7 = SF2 Positivo, 78 = Positivo Debito,
-- 90 = Positivo QR, 38 = Negativos, y el resto cae en "Otro TipoOpe" en vez de
-- descartarse (esta presentación necesita el 100% del volumen).
--
-- Se agrupa en el propio SQL: sin agrupar son decenas de millones de filas, y
-- el grano de salida (Periodo, Local, Legajo, EsTEC, TipoOpe) es exactamente el
-- que consume la presentación.
--
-- No se filtra por d.Anulado: se cuentan todas las operaciones, igual que el
-- criterio "todo" de query-sf2-completo.sql del dashboard. La presentación no
-- usa importes, así que no se traen.
select
    LEFT(txs.FechaCobro, 6)                                   as Periodo,
    loc.Id_JDE                                                as IdLocal,
    loc.Nombre                                                as Local,
    plac.Legajo_Ope                                           as Legajo,
    plac.ApeyNom_Ope                                          as Usuario,
    case when txs.IdPaycode = 'E0O' then 'TEC' else 'SF2 sin TEC' end as Grupo,
    case d.Id_TipoOpe
        when 7  then 'SF2 Positivo'
        when 78 then 'Positivo Debito'
        when 90 then 'Positivo QR'
        when 38 then 'Negativos'
        else 'Otro TipoOpe'
    end                                                       as TipoOperacion,
    COUNT(1)                                                  as Txs
from [dbo].[PLA_Transacciones_SF2] as txs
    inner join [dbo].[PLA_Cabecera] as plac
        on plac.Id_Planilla = txs.Id_Planilla and plac.Id_Local = txs.Id_local
    inner join [dbo].[PAR_Locales] as loc
        on loc.Id_Local = txs.Id_local
    inner join [dbo].[PLA_Detalle] as d
        on d.Id_Planilla = txs.Id_Planilla and d.Id_Local = txs.Id_local and d.Id_Movimiento = txs.Id_Movimiento
where txs.FechaCobro >= {desde}
group by
    LEFT(txs.FechaCobro, 6), loc.Id_JDE, loc.Nombre, plac.Legajo_Ope, plac.ApeyNom_Ope,
    case when txs.IdPaycode = 'E0O' then 'TEC' else 'SF2 sin TEC' end,
    case d.Id_TipoOpe
        when 7  then 'SF2 Positivo'
        when 78 then 'Positivo Debito'
        when 90 then 'Positivo QR'
        when 38 then 'Negativos'
        else 'Otro TipoOpe'
    end
order by Periodo, IdLocal, Legajo
