import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FuzzyDecisionFlow } from './FuzzyDecisionFlow'
import type {
  FuzzyCycleAction, FuzzyDecisionCycle, FuzzyEvaluation,
} from '../simulation/types'

const evaluation = (
  patch: Partial<FuzzyEvaluation> = {},
): FuzzyEvaluation => ({
  profile_version: 'mamdani-v1',
  valid: true,
  fallback_reason: null,
  inputs: {
    power_balance_ratio: -.1,
    battery_reserve_margin: 0,
    net_power_trend: -.05,
  },
  memberships: {
    power_balance: { deficit: .4, balanced: .6, surplus: 0 },
    battery_reserve: { short: .5, adequate: .5, ample: 0 },
    net_power_trend: { falling: .333, steady: .667, rising: 0 },
  },
  fired_rules: [
    {
      rule_id: 2,
      if: {
        power_balance: 'deficit',
        battery_reserve: 'short',
        net_power_trend: 'steady',
      },
      then: 'high',
      strength: .4,
    },
    {
      rule_id: 5,
      if: {
        power_balance: 'deficit',
        battery_reserve: 'adequate',
        net_power_trend: 'steady',
      },
      then: 'high',
      strength: .5,
    },
  ],
  aggregated_strengths: { low: 0, watch: .2, high: .5 },
  risk_score: 67.5,
  inferred_band: 'high',
  risk_band: 'watch',
  controller: {
    previous_band: 'watch',
    current_band: 'watch',
    transition: 'confirming_high_entry',
  },
  ...patch,
})

const action = (
  patch: Partial<FuzzyCycleAction> = {},
): FuzzyCycleAction => ({
  id: 7,
  action_id: 'action-7',
  decision_event_id: 'decision-1',
  device_id: 'sim-grid',
  action: 'on',
  countdown_s: 0,
  reason: 'grid takeover',
  branch: 'fuzzy.high.buy_grid',
  status: 'applied',
  resulting_state: true,
  executed_at: '2026-08-13T10:00:01Z',
  failure_reason: '',
  stage: 'applied',
  stageHistory: ['received', 'applied'],
  ...patch,
})

const cycle = (
  patch: Partial<FuzzyDecisionCycle> = {},
): FuzzyDecisionCycle => ({
  decisionId: 'decision-1',
  time: '2026-08-13T10:00:00Z',
  policy: 'fuzzy_active',
  mode: 'active',
  evaluation: evaluation(),
  fuzzyBranch: 'fuzzy.high.buy_grid',
  fuzzyActions: [action()],
  executedBranch: 'fuzzy.high.buy_grid',
  executedActions: [action()],
  counterfactualPolicy: 'crisp',
  counterfactualBranch: 'day.surplus.comfort_on',
  counterfactualActions: [action({
    id: undefined,
    action_id: undefined,
    device_id: 'sim-ac-unit',
    action: 'on',
    branch: 'day.surplus.comfort_on',
    reason: 'comfort schedule',
    status: undefined,
    resulting_state: undefined,
    executed_at: undefined,
    failure_reason: undefined,
    stage: 'counterfactual',
    stageHistory: ['counterfactual'],
  })],
  ...patch,
})

describe('FuzzyDecisionFlow', () => {
  it('renders all membership rings, multiple fired rules, and band disagreement accessibly', () => {
    const view = render(<FuzzyDecisionFlow
      cycle={cycle()}
      policy="fuzzy_active"
    />)

    expect(view.container.querySelectorAll('.fuzzy-membership')).toHaveLength(9)
    expect(screen.getByLabelText('Power deficit membership 0.400 (40%)')).toBeVisible()
    expect(screen.getByLabelText('Power surplus membership 0.000 (0%)')).toBeVisible()
    expect(screen.getByText('Rule 2 → high')).toBeVisible()
    expect(screen.getByText('Rule 5 → high')).toBeVisible()
    expect(screen.getByText('Inferred · high')).toBeVisible()
    expect(screen.getByText('Controller · watch')).toBeVisible()
    expect(screen.getByText('Hysteresis retains a different band')).toBeVisible()
  })

  it('shows the dashed fuzzy fork separately from the solid crisp shadow path', () => {
    render(<FuzzyDecisionFlow
      policy="fuzzy_shadow"
      cycle={cycle({
        policy: 'fuzzy_shadow',
        mode: 'shadow',
        fuzzyBranch: 'fuzzy.watch.preserve',
        fuzzyActions: [action({
          id: undefined,
          action_id: undefined,
          device_id: 'sim-ac-unit',
          action: 'on',
          branch: 'fuzzy.watch.preserve',
          stage: 'counterfactual',
          stageHistory: ['counterfactual'],
        })],
        executedBranch: 'day.surplus.comfort_on',
        executedActions: [action({
          device_id: 'sim-ac-unit',
          branch: 'day.surplus.comfort_on',
        })],
        counterfactualPolicy: 'fuzzy_active',
        counterfactualBranch: 'fuzzy.watch.preserve',
      })}
    />)

    expect(screen.getByText('fuzzy.watch.preserve')).toBeVisible()
    expect(screen.getByText('Not executed')).toBeVisible()
    expect(screen.getByText('day.surplus.comfort_on')).toBeVisible()
    expect(screen.getByText('Crisp execution')).toBeVisible()
    expect(screen.getByText(/Applied · grid takeover/)).toBeVisible()
  })

  it('renders invalid input through crisp fallback and its executed action', () => {
    render(<FuzzyDecisionFlow
      policy="fuzzy_active"
      cycle={cycle({
        mode: 'fallback',
        evaluation: evaluation({
          valid: false,
          fallback_reason: 'invalid_pv_baseline_W,invalid_load_baseline_W',
          inputs: {},
          memberships: {},
          fired_rules: [],
          aggregated_strengths: {},
          risk_score: null,
          inferred_band: null,
          risk_band: null,
          controller: { transition: 'invalid_hold' },
        }),
        fuzzyBranch: null,
        fuzzyActions: [],
        executedBranch: 'day.surplus.comfort_on',
      })}
    />)

    expect(screen.getByText('Invalid input')).toBeVisible()
    expect(screen.getByText('Crisp fallback')).toBeVisible()
    expect(screen.getByText('invalid_pv_baseline_W,invalid_load_baseline_W')).toBeVisible()
    expect(screen.getByText('day.surplus.comfort_on')).toBeVisible()
    expect(screen.queryByText('Memberships')).not.toBeInTheDocument()
  })

  it('renders authoritative protection without fabricated inference stages', () => {
    render(<FuzzyDecisionFlow
      policy="fuzzy_active"
      cycle={cycle({
        mode: 'authoritative_bypass',
        evaluation: evaluation({
          valid: false,
          fallback_reason: 'hard_protection_authoritative',
          inputs: {},
          memberships: {},
          fired_rules: [],
          aggregated_strengths: {},
          risk_score: null,
          inferred_band: null,
          risk_band: null,
          controller: { transition: 'not_evaluated' },
        }),
        fuzzyBranch: null,
        fuzzyActions: [],
        executedBranch: 'protect_battery',
      })}
    />)

    expect(screen.getByText('Authoritative bypass')).toBeVisible()
    expect(screen.getByText('protect_battery')).toBeVisible()
    expect(screen.queryByText('Memberships')).not.toBeInTheDocument()
    expect(screen.queryByText('Fired rules')).not.toBeInTheDocument()
  })

  it('shows preserve-state and disabled empty endpoints', () => {
    const view = render(<FuzzyDecisionFlow
      policy="fuzzy_active"
      cycle={cycle({
        fuzzyBranch: 'fuzzy.watch.preserve',
        fuzzyActions: [],
        executedBranch: 'fuzzy.watch.preserve',
        executedActions: [],
        counterfactualBranch: null,
        counterfactualActions: [],
      })}
    />)
    expect(screen.getAllByText('Preserve current state')).toHaveLength(2)

    view.rerender(<FuzzyDecisionFlow cycle={null} policy="crisp" />)
    expect(screen.getByText('Fuzzy supervisor disabled')).toBeVisible()
    expect(screen.getByText('Crisp controller is authoritative.')).toBeVisible()
  })
})

