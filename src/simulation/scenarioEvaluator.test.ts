import { describe, expect, it } from 'vitest'
import { freshObservations } from './defaults'
import { evaluateExpectation } from './scenarioEvaluator'
import { scenarios } from './scenarios'
import type { KBSAction, ScenarioObservations } from './types'

const action = (patch: Partial<KBSAction> = {}): KBSAction => ({
  id: 1, action_id: 'action-1', decision_event_id: 'decision-1',
  device_id: 'sim-ac-unit', action: 'off', countdown_s: 0,
  reason: 'test', branch: 'branch', created_at: '2026-01-01T00:00:00Z',
  status: 'pending', resulting_state: null, executed_at: null,
  failure_reason: '', ...patch,
})

describe('Scenario Lab definitions and evaluation', () => {
  it('contains the reference suite plus deterministic fuzzy scenarios', () => {
    expect(scenarios).toHaveLength(24)
    expect(scenarios.filter((item) => item.tier === 'Tier-1')).toHaveLength(6)
    expect(scenarios.filter((item) => item.tier === 'Tier-2')).toHaveLength(14)
    expect(scenarios.filter((item) => item.tier === 'Integrated')).toHaveLength(4)
    expect(new Set(scenarios.map((item) => item.id)).size).toBe(24)
    expect(scenarios.map((item) => item.id)).toEqual(expect.arrayContaining([
      'fuzzy-immediate-high', 'fuzzy-confirm-high', 'fuzzy-two-cycle-recovery',
      'fuzzy-boundary-noise', 'fuzzy-invalid-input', 'fuzzy-shadow-comparison',
    ]))
  })

  it('models the Damascus utility failure from physical configuration rather than sensor overrides', () => {
    const scenario = scenarios.find((item) => item.id === 'real-damascus-evening-outage')
    expect(scenario?.setup).toMatchObject({
      city: 'Damascus', maxPvW: 4000, maxInverterW: 4000,
      batteryCapacityWh: 5000, batteryNominalV: 24, batterySocPercent: 27,
      tier1: true, tier2: true, gridAvailable: true,
    })
    expect(scenario?.setup.overrides).toBeUndefined()
    expect(scenario?.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ changes: { state: { gridAvailable: false } } }),
    ]))
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
      fuzzyBands: ['high'], fuzzyFallbackReasons: ['hard_protection_authoritative'],
      counterfactualBranches: ['fuzzy.high.buy_grid'],
      bandTransitions: ['immediate_high_entry'],
      backendErrors: ['offline'],
    }
    expect(evaluateExpectation({ type: 'tier1_situation', value: 'battery_low', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier1_action', devices: ['sim-ac-unit'], action: 'off', countdown: 'positive', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier2_branch', values: ['protect_battery'], label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'on', stage: 'blocked', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier2_alert', kind: 'battery_low', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'backend_error', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'tier1_action_absent', deviceId: 'sim-servers', action: 'off', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'fuzzy_band', values: ['high'], label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'fuzzy_fallback', value: 'hard_protection_authoritative', label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'counterfactual_branch', values: ['fuzzy.high.buy_grid'], label: '' }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({ type: 'band_transition', values: ['immediate_high_entry'], label: '' }, observations, [], true)).toBe('pass')
  })
})
