-- Money Transfer (Wupos) por operador: el tercer grupo de la presentación.
--
-- El tipo de operación sale de mt.Tipo (E01 = Envíos, P01 = Pagos), no de
-- Id_TipoOpe: es el mismo criterio que usa el pipeline del Dashboard Canal
-- Propio, validado contra la base.
--
-- LEFT JOIN a PLA_Detalle a propósito: una transacción sin detalle igual es una
-- transacción y tiene que contarse. Como la presentación no usa importes ni
-- ponderación, el join solo queda por simetría con el criterio de origen.
select
    LEFT(mt.Fecha, 6)      as Periodo,
    loc.Id_JDE             as IdLocal,
    loc.Nombre             as Local,
    plac.Legajo_Ope        as Legajo,
    plac.ApeyNom_Ope       as Usuario,
    'MT'                   as Grupo,
    case mt.Tipo
        when 'E01' then 'Envios'
        when 'P01' then 'Pagos'
        else mt.Tipo
    end                    as TipoOperacion,
    COUNT(1)               as Txs
from [dbo].[PLA_Transacciones_MT] as mt
    inner join [dbo].[PLA_Cabecera] as plac
        on plac.Id_Planilla = mt.Id_Planilla and plac.Id_Local = mt.Id_Local
    inner join [dbo].[PAR_Locales] as loc
        on loc.Id_Local = mt.Id_Local
where mt.Fecha >= {desde}
group by
    LEFT(mt.Fecha, 6), loc.Id_JDE, loc.Nombre, plac.Legajo_Ope, plac.ApeyNom_Ope,
    case mt.Tipo
        when 'E01' then 'Envios'
        when 'P01' then 'Pagos'
        else mt.Tipo
    end
order by Periodo, IdLocal, Legajo
