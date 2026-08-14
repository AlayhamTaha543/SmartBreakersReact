import { act, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useEffect } from 'react'
import { SimulatorProvider, useSimulator } from '../state/SimulatorContext'
import { scenarios } from './scenarios'

type Runtime = ReturnType<typeof useSimulator>
let current: Runtime | null = null
const runtime = () => {
  if (!current) throw new Error('Simulator harness is not ready')
  return current
}

function Harness() {
  const value = useSimulator()
  useEffect(() => { current = value }, [value])
  return null
}

const requestedScenarioIds = process.env.LIVE_SCENARIOS
  ?.split(',')
  .map((id) => id.trim())
  .filter(Boolean)
const selectedScenarios = requestedScenarioIds?.length
  ? requestedScenarioIds
    .map((id) => scenarios.find((scenario) => scenario.id === id))
    .filter((scenario): scenario is (typeof scenarios)[number] => Boolean(scenario))
  : scenarios
const describeLive = process.env.RUN_LIVE_SCENARIOS === '1' ? describe : describe.skip
const describeComparison = process.env.RUN_LIVE_COMPARISON === '1' ? describe : describe.skip
const forceBothTiers = process.env.LIVE_FORCE_BOTH_TIERS === '1'
const reportScenarios = process.env.LIVE_SCENARIO_REPORT === '1'

describeLive('live local Python services', () => {
  it.each(selectedScenarios)(
    '$id passes every declared expectation with isolated state',
    async (definition) => {
      localStorage.clear()
      current = null
      const view = render(<SimulatorProvider><Harness /></SimulatorProvider>)
      try {
        await waitFor(
          () => expect(runtime().climateRows).toHaveLength(84),
          { timeout: 10_000 },
        )
        act(() => {
          if (forceBothTiers) {
            runtime().selectScenario(definition.id)
            runtime().updateScenarioSetup({
              tier1: true,
              tier2: true,
              ...(definition.durationRealS <= definition.setup.tier2CycleS
                ? { tier2CycleS: definition.durationRealS / 2 }
                : {}),
            })
          }
          runtime().loadScenario(definition.id)
        })
        await act(async () => { await runtime().startScenario(true) })
        await waitFor(
          () => expect(runtime().scenario.completed).toBe(true),
          {
            timeout: (definition.durationRealS + 10) * 1000,
            interval: 200,
          },
        )
        const activeRuntime = runtime()
        const results = activeRuntime.scenario.results
        const report = {
          id: definition.id,
          results,
          observations: activeRuntime.scenario.observations,
        }
        if (reportScenarios) {
          console.info('LIVE_SCENARIO_RESULT ' + JSON.stringify(report))
        }
        expect(
          results,
          definition.id + ': ' + JSON.stringify(report),
        ).toEqual(definition.expectations.map(() => 'pass'))
      } finally {
        view.unmount()
        current = null
        localStorage.clear()
      }
    },
    80_000,
  )
})

describeComparison('live crisp versus fuzzy comparison', () => {
  it('resets and runs the same scenario under both policies', async () => {
    localStorage.clear()
    current = null
    const scenarioId = process.env.LIVE_COMPARISON_SCENARIO
      ?? 'fuzzy-boundary-noise'
    const definition = scenarios.find((item) => item.id === scenarioId)
    if (!definition) throw new Error('Unknown comparison scenario: ' + scenarioId)
    const view = render(<SimulatorProvider><Harness /></SimulatorProvider>)
    await waitFor(
      () => expect(runtime().climateRows).toHaveLength(84),
      { timeout: 10_000 },
    )
    act(() => {
      runtime().selectScenario(definition.id)
      runtime().loadScenario(definition.id)
    })

    await act(async () => { await runtime().runScenarioComparison() })

    const result = runtime().comparison
    console.info('LIVE_COMPARISON_RESULT ' + JSON.stringify(result))
    expect(result.status).toBe('complete')
    expect(result.scenarioId).toBe(definition.id)
    expect(result.crisp?.policy).toBe('crisp')
    expect(result.fuzzy?.policy).toBe('fuzzy_active')
    expect(result.differences).not.toBeNull()
    expect(result.crisp?.metrics.mandatoryOffCommands).toBe(0)
    expect(result.fuzzy?.metrics.mandatoryOffCommands).toBe(0)
    view.unmount()
  }, 120_000)
})
