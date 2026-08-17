import { describe, expect, it } from 'vitest'
import { freshObservations } from './defaults'
import { evaluateExpectation } from './scenarioEvaluator'
import type { FuzzyDecisionCycle, KBSAction } from './types'

const action: KBSAction = {
  id: 1,
  action_id: 'action-1',
  decision_event_id: 'decision-1',
  device_id: 'sim-ac-unit',
  action: 'off',
  countdown_s: 0,
  reason: 'test',
  branch: 'fuzzy.watch.preserve',
  created_at: '2026-01-01T00:00:00Z',
  status: 'applied',
  resulting_state: false,
  executed_at: '2026-01-01T00:00:01Z',
  failure_reason: '',
}

const fuzzyCycle = (ruleIds = [2, 5]): FuzzyDecisionCycle => ({
  decisionId: 'decision-1',
  time: '2026-01-01T00:00:00Z',
  policy: 'fuzzy_active',
  mode: 'active',
  evaluation: {
    profile_version: 'mamdani-v1',
    valid: true,
    fallback_reason: null,
    inputs: {
      power_balance_ratio: 0,
      battery_reserve_margin: .1,
      net_power_trend: 0,
    },
    memberships: {
      power_balance: { deficit: 0, balanced: 1, surplus: 0 },
      battery_reserve: { short: 0, adequate: 1, ample: 0 },
      net_power_trend: { falling: 0, steady: 1, rising: 0 },
    },
    fired_rules: ruleIds.map((ruleId) => ({
      rule_id: ruleId,
      if: {
        power_balance: 'balanced',
        battery_reserve: 'adequate',
        net_power_trend: 'steady',
      },
      then: 'watch',
      strength: .5,
    })),
    aggregated_strengths: { low: 0, watch: .5, high: 0 },
    risk_score: 50,
    inferred_band: 'watch',
    risk_band: 'watch',
    controller: { current_band: 'watch', transition: 'held' },
  },
  fuzzyBranch: 'fuzzy.watch.preserve',
  fuzzyActions: [],
  executedBranch: 'fuzzy.watch.preserve',
  executedActions: [{
    ...action,
    stage: 'applied',
    stageHistory: ['received', 'held_by_tier1', 'applied'],
  }],
  counterfactualPolicy: 'crisp',
  counterfactualBranch: 'day.surplus.comfort_on',
  counterfactualActions: [],
})

describe('fuzzy cycle scenario evaluation', () => {
  it('matches rule IDs as exact sets or required subsets', () => {
    const observations = {
      ...freshObservations(),
      fuzzyCycles: [fuzzyCycle()],
    }

    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 1,
      ruleIds: { match: 'exact', values: [5, 2] },
      label: '',
    }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 1,
      ruleIds: { match: 'subset', values: [5] },
      label: '',
    }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 1,
      ruleIds: { match: 'exact', values: [2] },
      label: '',
    }, observations, [], true)).toBe('fail')
  })

  it('treats every fuzzy numeric range endpoint as inclusive', () => {
    const observations = {
      ...freshObservations(),
      fuzzyCycles: [fuzzyCycle()],
    }

    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 1,
      inputs: {
        power_balance_ratio: { min: 0, max: 0 },
        battery_reserve_margin: { min: .1, max: .1 },
      },
      memberships: {
        power_balance: {
          balanced: { min: 1, max: 1 },
        },
      },
      aggregation: {
        watch: { min: .5, max: .5 },
      },
      riskScore: { min: 50, max: 50 },
      label: '',
    }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 1,
      riskScore: { min: 50.001, max: 60 },
      label: '',
    }, observations, [], true)).toBe('fail')
  })

  it('uses one-based cycles and supports final and visited action stages', () => {
    const observations = {
      ...freshObservations(),
      fuzzyCycles: [fuzzyCycle()],
    }

    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 1,
      totalCycles: 1,
      action: {
        path: 'executed',
        deviceId: 'sim-ac-unit',
        action: 'off',
        stage: 'held_by_tier1',
        stageMatch: 'visited',
      },
      label: '',
    }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 1,
      action: {
        path: 'executed',
        deviceId: 'sim-ac-unit',
        action: 'off',
        stage: 'applied',
      },
      label: '',
    }, observations, [], true)).toBe('pass')
    expect(evaluateExpectation({
      type: 'fuzzy_cycle',
      cycle: 2,
      label: '',
    }, observations, [], true)).toBe('fail')
  })
})

