import type { ScenarioMetrics } from './types'

export function differenceMetrics(
  crisp: ScenarioMetrics, fuzzy: ScenarioMetrics,
): ScenarioMetrics {
  return {
    gridImportWh: fuzzy.gridImportWh - crisp.gridImportWh,
    minimumBatterySocPercent: fuzzy.minimumBatterySocPercent - crisp.minimumBatterySocPercent,
    timeBelowReserveS: fuzzy.timeBelowReserveS - crisp.timeBelowReserveS,
    optionalLoadServedWh: fuzzy.optionalLoadServedWh - crisp.optionalLoadServedWh,
    mandatoryOffCommands: fuzzy.mandatoryOffCommands - crisp.mandatoryOffCommands,
    actionCount: fuzzy.actionCount - crisp.actionCount,
    commandReversals: fuzzy.commandReversals - crisp.commandReversals,
  }
}
