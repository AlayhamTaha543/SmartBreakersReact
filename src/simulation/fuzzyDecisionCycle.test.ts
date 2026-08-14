import { describe, expect, it } from 'vitest'
import {
  buildFuzzyDecisionCycle, countdownForAction, decisionActionKey,
  shouldExecuteBackendAction, updateFuzzyDecisionCycleActionStage,
  upsertFuzzyDecisionCycle,
} from './fuzzyDecisionCycle'
import type {
  CounterfactualDecision, FuzzyEvaluation, KBSAction, KBSActionStatus,
  KBSDecision, Tier2Policy,
} from './types'

const evaluation = (
  patch: Partial<FuzzyEvaluation> = {},
): FuzzyEvaluation => ({
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
  fired_rules: [{
    rule_id: 14,
    if: {
      power_balance: 'balanced',
      battery_reserve: 'adequate',
      net_power_trend: 'steady',
    },
    then: 'watch',
    strength: 1,
  }],
  aggregated_strengths: { low: 0, watch: 1, high: 0 },
  risk_score: 50,
  inferred_band: 'watch',
  risk_band: 'watch',
  controller: { current_band: 'watch', transition: 'held' },
  ...patch,
})

const action = (
  patch: Partial<KBSAction> = {},
): KBSAction => ({
  id: 7,
  action_id: '6d89a9e0-7942-419e-b02e-a8dad93b5ad8',
  decision_event_id: 'decision-a',
  device_id: 'sim-grid',
  action: 'on',
  countdown_s: 0,
  reason: 'grid takeover',
  branch: 'fuzzy.high.buy_grid',
  created_at: '2026-08-13T10:00:00Z',
  status: 'pending',
  resulting_state: null,
  executed_at: null,
  failure_reason: '',
  ...patch,
})

const counterfactual = (
  policy: Tier2Policy | 'crisp',
  branch: string,
): CounterfactualDecision => ({
  policy,
  branch,
  actions: [{
    device_id: 'sim-ac-unit',
    action: 'on',
    countdown_s: 0,
    reason: 'comfort',
  }],
  alerts: [],
})

const decision = (
  patch: Partial<KBSDecision> = {},
): KBSDecision => ({
  engine: 'apps.kbs.services.run_cycle',
  event_id: 'decision-a',
  policy: 'fuzzy_active',
  branch: 'fuzzy.high.buy_grid',
  created_at: '2026-08-13T10:00:00Z',
  facts: {},
  fuzzy_evaluation: evaluation(),
  counterfactual: counterfactual('crisp', 'day.surplus.comfort_on'),
  actions: [action()],
  ...patch,
})

describe('fuzzy decision-cycle construction', () => {
  it('models active fuzzy execution beside a crisp counterfactual', () => {
    const cycle = buildFuzzyDecisionCycle(decision())
    expect(cycle).toMatchObject({
      decisionId: 'decision-a',
      mode: 'active',
      fuzzyBranch: 'fuzzy.high.buy_grid',
      executedBranch: 'fuzzy.high.buy_grid',
      counterfactualBranch: 'day.surplus.comfort_on',
    })
    expect(cycle?.fuzzyActions[0]).toMatchObject({ id: 7, stage: 'received' })
    expect(cycle?.executedActions[0]).toMatchObject({ id: 7, stage: 'received' })
    expect(cycle?.counterfactualActions[0]).toMatchObject({
      device_id: 'sim-ac-unit', stage: 'counterfactual',
    })
  })

  it('keeps fuzzy shadow evidence separate from the crisp executed path', () => {
    const cycle = buildFuzzyDecisionCycle(decision({
      policy: 'fuzzy_shadow',
      branch: 'day.surplus.comfort_on',
      counterfactual: counterfactual('fuzzy_active', 'fuzzy.watch.preserve'),
      actions: [action({
        branch: 'day.surplus.comfort_on',
        device_id: 'sim-ac-unit',
      })],
    }))
    expect(cycle).toMatchObject({
      mode: 'shadow',
      fuzzyBranch: 'fuzzy.watch.preserve',
      executedBranch: 'day.surplus.comfort_on',
    })
    expect(cycle?.fuzzyActions[0].stage).toBe('counterfactual')
    expect(cycle?.executedActions[0].stage).toBe('received')
  })

  it('distinguishes invalid fallback and authoritative bypass evidence', () => {
    const invalid = buildFuzzyDecisionCycle(decision({
      fuzzy_evaluation: evaluation({
        valid: false,
        fallback_reason: 'invalid_pv_baseline_W',
        inputs: {},
        memberships: {},
        fired_rules: [],
        aggregated_strengths: {},
        risk_score: null,
        inferred_band: null,
      }),
      branch: 'day.surplus.comfort_on',
    }))
    const bypass = buildFuzzyDecisionCycle(decision({
      fuzzy_evaluation: evaluation({
        valid: false,
        fallback_reason: 'hard_protection_authoritative',
        inputs: {},
        memberships: {},
        fired_rules: [],
        aggregated_strengths: {},
        risk_score: null,
        inferred_band: null,
      }),
      branch: 'protect_battery',
    }))
    expect(invalid?.mode).toBe('fallback')
    expect(invalid?.fuzzyActions).toEqual([])
    expect(bypass?.mode).toBe('authoritative_bypass')
    expect(bypass?.fuzzyBranch).toBeNull()
  })

  it('does not fabricate a fuzzy cycle for crisp-only evidence', () => {
    expect(buildFuzzyDecisionCycle(decision({
      policy: 'crisp',
      fuzzy_evaluation: undefined,
    }))).toBeNull()
  })
})

describe('fuzzy cycle lifecycle correlation', () => {
  it('deduplicates by event id and merges action outcomes only by numeric id', () => {
    const first = buildFuzzyDecisionCycle(decision())!
    const applied = buildFuzzyDecisionCycle(decision({
      actions: [action({
        status: 'applied',
        resulting_state: true,
        executed_at: '2026-08-13T10:00:01Z',
      })],
    }))!
    const cycles = upsertFuzzyDecisionCycle(
      upsertFuzzyDecisionCycle([], first),
      applied,
    )
    expect(cycles).toHaveLength(1)
    expect(cycles[0].executedActions[0]).toMatchObject({
      id: 7, stage: 'applied', resulting_state: true,
    })

    const wrongEvent = updateFuzzyDecisionCycleActionStage(
      cycles[0], 'decision-b', 7, 'failed',
    )
    const wrongAction = updateFuzzyDecisionCycleActionStage(
      cycles[0], 'decision-a', 99, 'failed',
    )
    expect(wrongEvent).toBe(cycles[0])
    expect(wrongAction.executedActions[0].stage).toBe('applied')
  })

  it('retains ID-less counterfactual snapshots once when state refreshes merge', () => {
    const first = buildFuzzyDecisionCycle(decision())!
    const refreshed = buildFuzzyDecisionCycle(decision())!
    const cycles = upsertFuzzyDecisionCycle(
      upsertFuzzyDecisionCycle([], first),
      refreshed,
    )

    expect(cycles).toHaveLength(1)
    expect(cycles[0].counterfactualActions).toHaveLength(1)
    expect(cycles[0].counterfactualActions[0].stage).toBe('counterfactual')
  })

  it('retains Tier-1 holds in history before a later apply', () => {
    const cycle = buildFuzzyDecisionCycle(decision())!
    const held = updateFuzzyDecisionCycleActionStage(
      cycle, 'decision-a', 7, 'held_by_tier1', action(),
    )
    const applied = updateFuzzyDecisionCycleActionStage(
      held, 'decision-a', 7, 'applied', action({ status: 'applied' }),
    )
    expect(applied.executedActions[0].stage).toBe('applied')
    expect(applied.executedActions[0].stageHistory).toEqual([
      'received', 'held_by_tier1', 'applied',
    ])
  })

  it('preserves the complete original action in delayed countdowns', () => {
    const delayed = action({ countdown_s: 90, branch: 'protect_battery' })
    const countdown = countdownForAction(delayed, 'decision-a', 1_000)
    expect(countdown.key).toBe('T2-' + decisionActionKey('decision-a', 7))
    expect(countdown.fireAtSimMs).toBe(91_000)
    expect(countdown.decisionId).toBe('decision-a')
    expect(countdown.action).toBe(delayed)
  })

  it.each([
    ['pending', true],
    ['scheduled', true],
    ['applied', false],
    ['blocked', false],
    ['suppressed_duplicate', false],
    ['failed', false],
    ['noop', false],
    ['superseded', false],
  ] as Array<[KBSActionStatus, boolean]>)(
    'executes backend status %s only when unresolved',
    (status, expected) => {
      expect(shouldExecuteBackendAction(action({ status }))).toBe(expected)
    },
  )
})
