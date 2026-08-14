import { describe, expect, it } from 'vitest'
import { differenceMetrics } from './scenarioMetrics'
import type { ScenarioMetrics } from './types'

const crisp: ScenarioMetrics = {
  gridImportWh: 100, minimumBatterySocPercent: 30, timeBelowReserveS: 60,
  optionalLoadServedWh: 200, mandatoryOffCommands: 0, actionCount: 10,
  commandReversals: 5,
}

describe('scenario comparison metrics', () => {
  it('reports fuzzy minus crisp for every activation-gate metric', () => {
    expect(differenceMetrics(crisp, {
      gridImportWh: 80, minimumBatterySocPercent: 32, timeBelowReserveS: 30,
      optionalLoadServedWh: 205, mandatoryOffCommands: 0, actionCount: 7,
      commandReversals: 3,
    })).toEqual({
      gridImportWh: -20, minimumBatterySocPercent: 2, timeBelowReserveS: -30,
      optionalLoadServedWh: 5, mandatoryOffCommands: 0, actionCount: -3,
      commandReversals: -2,
    })
  })
})
