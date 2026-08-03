import { describe, expect, it } from 'vitest'
import { freshObservations } from './defaults'
import { evaluateExpectation } from './scenarioEvaluator'
import { scenarios } from './scenarios'
import type { KBSAction, ScenarioObservations } from './types'

const action = (patch: Partial<KBSAction> = {}): KBSAction => ({
  id: 1, device_id: 'sim-ac-unit', action: 'off', countdown_s: 0,
  reason: 'test', branch: 'branch', created_at: '2026-01-01T00:00:00Z', ...patch,
})

describe('Scenario Lab definitions and evaluation', () => {
  it('contains the exact reference split of 17 scenarios', () => {
    expect(scenarios).toHaveLength(17)
    expect(scenarios.filter((item) => item.tier === 'Tier-1')).toHaveLength(6)
    expect(scenarios.filter((item) => item.tier === 'Tier-2')).toHaveLength(8)
    expect(scenarios.filter((item) => item.tier === 'Integrated')).toHaveLength(3)
    expect(new Set(scenarios.map((item) => item.id)).size).toBe(17)
  })

  it('evaluates situation, countdown, branch, stage, alert and absence expectations', () => {
    const observations: ScenarioObservations = {
      ...freshObservations(), tier1Evaluations: 2, tier1Situations: ['battery_low'],
      tier1Commands: [{ device_id: 'sim-ac-unit', action: 'off', countdown_s: 60, reason: 'low' }],
      tier2Branches: ['protect_battery'],
      tier2ActionsReceived: [action({ countdown_s: 60 })],
      tier2ActionsApplied: [action({ id: 2, device_id: 'sim-grid', action: 'on' })],
      tier2ActionsBlocked: [action({ id: 3, action: 'on' })],
      tier2Alerts: [{ kind: 'battery_low', severity: 'warning', message: 'low', created_at: 'now' }],
      backendErrors: ['offline'],
    }
    expect(evaluateExpectation({ type: 'tier1_situation', value: 'battery_low', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier1_action', devices: ['sim-ac-unit'], action: 'off', countdown: 'positive', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier2_branch', values: ['protect_battery'], label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'on', stage: 'blocked', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier2_alert', kind: 'battery_low', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'backend_error', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier1_action_absent', deviceId: 'sim-servers', action: 'off', label: '' }, observations, [], true)).toBe('pass')
  })
})
