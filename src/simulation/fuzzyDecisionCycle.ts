import type {
  Countdown, CounterfactualDecision, FuzzyActionStage, FuzzyCycleAction,
  FuzzyDecisionCycle, FuzzyEvaluation, KBSAction, KBSActionStatus, KBSDecision,
  Tier2Policy,
} from './types'

const terminalStages = new Set<FuzzyActionStage>([
  'applied', 'suppressed', 'failed', 'no_op', 'superseded',
])

const authoritativeFallbacks = new Set([
  'hard_protection_authoritative',
  'tier1_interlock_authoritative',
])

const hasEvaluation = (
  value: KBSDecision['fuzzy_evaluation'],
): value is FuzzyEvaluation => Boolean(value?.profile_version)

export function actionStageFromBackend(
  status: KBSActionStatus,
  countdownS = 0,
): FuzzyActionStage {
  if (status === 'scheduled') return 'scheduled'
  if (status === 'applied') return 'applied'
  if (status === 'blocked') return 'held_by_tier1'
  if (status === 'failed') return 'failed'
  if (status === 'noop') return 'no_op'
  if (status === 'suppressed_duplicate') return 'suppressed'
  if (status === 'superseded') return 'superseded'
  return countdownS > 0 ? 'received' : 'received'
}

export function shouldExecuteBackendAction(
  action: Pick<KBSAction, 'status'>,
) {
  return action.status == null
    || action.status === 'pending'
    || action.status === 'scheduled'
}

export function decisionActionKey(decisionId: string, actionId: number) {
  return decisionId + ':' + actionId
}

export function countdownForAction(
  action: KBSAction,
  decisionId: string,
  simMs: number,
): Countdown {
  return {
    key: 'T2-' + decisionActionKey(decisionId, action.id),
    source: 'T2',
    deviceId: action.device_id,
    fireAtSimMs: simMs + action.countdown_s * 1000,
    reason: action.reason,
    decisionId,
    action,
  }
}

function backendCycleAction(action: KBSAction): FuzzyCycleAction {
  const stage = actionStageFromBackend(action.status, action.countdown_s)
  return {
    ...action,
    stage,
    stageHistory: [stage],
  }
}

function counterfactualCycleAction(
  action: NonNullable<CounterfactualDecision['actions']>[number],
  branch: string,
): FuzzyCycleAction {
  return {
    id: action.id,
    action_id: action.action_id,
    decision_event_id: action.decision_event_id,
    device_id: action.device_id,
    action: action.action,
    countdown_s: action.countdown_s,
    reason: action.reason,
    branch: action.branch ?? branch,
    status: action.status,
    resulting_state: action.resulting_state,
    executed_at: action.executed_at,
    failure_reason: action.failure_reason,
    stage: 'counterfactual',
    stageHistory: ['counterfactual'],
  }
}

function counterfactualActions(
  counterfactual: CounterfactualDecision | undefined,
) {
  const branch = counterfactual?.branch ?? ''
  return (counterfactual?.actions ?? []).map((action) =>
    counterfactualCycleAction(action, branch))
}

function cycleMode(
  policy: Tier2Policy,
  evaluation: FuzzyEvaluation,
): FuzzyDecisionCycle['mode'] {
  if (
    evaluation.fallback_reason
    && (
      authoritativeFallbacks.has(evaluation.fallback_reason)
      || evaluation.fallback_reason.endsWith('_authoritative')
    )
  ) return 'authoritative_bypass'
  if (!evaluation.valid) return 'fallback'
  return policy === 'fuzzy_shadow' ? 'shadow' : 'active'
}

export function buildFuzzyDecisionCycle(
  decision: KBSDecision,
): FuzzyDecisionCycle | null {
  if (!decision.event_id || !hasEvaluation(decision.fuzzy_evaluation)) return null
  const policy = decision.policy ?? 'crisp'
  if (policy === 'crisp') return null
  const evaluation = decision.fuzzy_evaluation
  const mode = cycleMode(policy, evaluation)
  const executedActions = (decision.actions ?? []).map(backendCycleAction)
  const alternateActions = counterfactualActions(decision.counterfactual)
  const fuzzyIsExecuted = mode === 'active'
  const fuzzyIsCounterfactual = mode === 'shadow'

  return {
    decisionId: decision.event_id,
    time: decision.occurred_at
      ?? decision.created_at
      ?? decision.received_at
      ?? '',
    policy,
    mode,
    evaluation,
    fuzzyBranch: fuzzyIsExecuted
      ? decision.branch
      : fuzzyIsCounterfactual
        ? decision.counterfactual?.branch ?? null
        : null,
    fuzzyActions: fuzzyIsExecuted
      ? executedActions.map((action) => ({ ...action, stageHistory: [...action.stageHistory] }))
      : fuzzyIsCounterfactual
        ? alternateActions.map((action) => ({ ...action, stageHistory: [...action.stageHistory] }))
        : [],
    executedBranch: decision.branch,
    executedActions,
    counterfactualPolicy: decision.counterfactual?.policy ?? null,
    counterfactualBranch: decision.counterfactual?.branch ?? null,
    counterfactualActions: alternateActions,
  }
}

function stageAfterMerge(
  current: FuzzyActionStage,
  incoming: FuzzyActionStage,
) {
  if (terminalStages.has(incoming)) return incoming
  if (terminalStages.has(current)) return current
  if (
    current === 'held_by_tier1'
    && (incoming === 'received' || incoming === 'scheduled')
  ) return current
  if (current === 'scheduled' && incoming === 'received') return current
  return incoming
}

function mergeAction(
  current: FuzzyCycleAction,
  incoming: FuzzyCycleAction,
) {
  const stage = stageAfterMerge(current.stage, incoming.stage)
  const stageHistory = [...current.stageHistory]
  for (const value of incoming.stageHistory) {
    if (!stageHistory.includes(value)) stageHistory.push(value)
  }
  if (!stageHistory.includes(stage)) stageHistory.push(stage)
  return {
    ...current,
    ...incoming,
    stage,
    stageHistory,
  }
}

function mergeActionLists(
  current: FuzzyCycleAction[],
  incoming: FuzzyCycleAction[],
) {
  const hasUnidentifiedCurrent = current.some((action) => action.id == null)
  const remaining = [...incoming]
  const merged = current.map((action) => {
    if (action.id == null) return action
    const index = remaining.findIndex((candidate) => candidate.id === action.id)
    if (index < 0) return action
    const [candidate] = remaining.splice(index, 1)
    return mergeAction(action, candidate)
  })
  return [
    ...merged,
    ...remaining.filter((action) =>
      action.id != null || !hasUnidentifiedCurrent),
  ]
}

export function mergeFuzzyDecisionCycle(
  current: FuzzyDecisionCycle,
  incoming: FuzzyDecisionCycle,
) {
  if (current.decisionId !== incoming.decisionId) return current
  return {
    ...current,
    ...incoming,
    fuzzyActions: mergeActionLists(current.fuzzyActions, incoming.fuzzyActions),
    executedActions: mergeActionLists(current.executedActions, incoming.executedActions),
    counterfactualActions: mergeActionLists(
      current.counterfactualActions,
      incoming.counterfactualActions,
    ),
  }
}

export function upsertFuzzyDecisionCycle(
  cycles: FuzzyDecisionCycle[],
  incoming: FuzzyDecisionCycle,
) {
  const index = cycles.findIndex((cycle) => cycle.decisionId === incoming.decisionId)
  if (index < 0) return [...cycles, incoming]
  return cycles.map((cycle, cycleIndex) =>
    cycleIndex === index ? mergeFuzzyDecisionCycle(cycle, incoming) : cycle)
}

function updateActionListStage(
  actions: FuzzyCycleAction[],
  actionId: number,
  stage: FuzzyActionStage,
  action?: KBSAction,
) {
  return actions.map((current) => {
    if (current.id !== actionId) return current
    const history = current.stageHistory.includes(stage)
      ? current.stageHistory
      : [...current.stageHistory, stage]
    return {
      ...current,
      ...(action ?? {}),
      stage,
      stageHistory: history,
    }
  })
}

export function updateFuzzyDecisionCycleActionStage(
  cycle: FuzzyDecisionCycle,
  decisionId: string,
  actionId: number,
  stage: FuzzyActionStage,
  action?: KBSAction,
) {
  if (cycle.decisionId !== decisionId) return cycle
  return {
    ...cycle,
    fuzzyActions: updateActionListStage(cycle.fuzzyActions, actionId, stage, action),
    executedActions: updateActionListStage(cycle.executedActions, actionId, stage, action),
    counterfactualActions: updateActionListStage(
      cycle.counterfactualActions, actionId, stage, action,
    ),
  }
}

export function updateFuzzyCyclesActionStage(
  cycles: FuzzyDecisionCycle[],
  decisionId: string,
  actionId: number,
  stage: FuzzyActionStage,
  action?: KBSAction,
) {
  return cycles.map((cycle) =>
    updateFuzzyDecisionCycleActionStage(
      cycle, decisionId, actionId, stage, action,
    ))
}
