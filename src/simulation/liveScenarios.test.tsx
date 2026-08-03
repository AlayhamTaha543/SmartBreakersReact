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
  ? scenarios.filter((scenario) => requestedScenarioIds.includes(scenario.id))
  : scenarios
const describeLive = process.env.RUN_LIVE_SCENARIOS === '1' ? describe : describe.skip

describeLive('live local Python services', () => {
  it('passes every declared expectation in the selected scenarios', async () => {
    localStorage.clear()
    current = null
    const view = render(<SimulatorProvider><Harness /></SimulatorProvider>)
    await waitFor(() => expect(runtime().climateRows).toHaveLength(84), { timeout: 10_000 })
    const failures: string[] = []
    for (const definition of selectedScenarios) {
      act(() => runtime().loadScenario(definition.id))
      await act(async () => { await runtime().startScenario(true) })
      await waitFor(() => expect(runtime().scenario.completed).toBe(true), {
        timeout: (definition.durationRealS + 10) * 1000,
        interval: 200,
      })
      const activeRuntime = runtime()
      const results = activeRuntime.scenario.results
      if (!results.every((result) => result === 'pass')) {
        failures.push(definition.id + ': ' + JSON.stringify({
          results,
          observations: activeRuntime.scenario.observations,
        }))
      }
    }
    view.unmount()
    expect(failures).toEqual([])
  }, 260_000)
})
