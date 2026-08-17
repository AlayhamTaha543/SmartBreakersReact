import { describe, expect, it } from 'vitest'
import { cycleTiming } from './cycleTiming'

describe('Tier-2 cycle timing', () => {
  it('maps the React defaults to five simulated minutes and ten-minute confirmation', () => {
    expect(cycleTiming(5, 60)).toEqual({
      realSecondsPerCycle: 5,
      simulatedMinutesPerCycle: 5,
      twoCycleRealSeconds: 10,
      twoCycleSimulatedMinutes: 10,
    })
  })

  it('represents the production default independently of clock acceleration', () => {
    expect(cycleTiming(300, 1).twoCycleRealSeconds).toBe(600)
  })
})
