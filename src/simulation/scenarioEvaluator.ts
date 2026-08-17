import type {
  FuzzyCycleAction, ScenarioExpectation, ScenarioMetrics, ScenarioObservations,
  SimulatedBreaker,
} from './types'

export type ExpectationResult = 'pending' | 'pass' | 'fail'

export function evaluateExpectation(
  expectation: ScenarioExpectation,
  observations: ScenarioObservations,
  breakers: SimulatedBreaker[],
  final = false,
  metrics?: ScenarioMetrics,
): ExpectationResult {
  const missing = (): ExpectationResult => final ? 'fail' : 'pending'
  const actionMatches = (action: { device_id: string; action: string }, deviceId: string, target: string) =>
    action.device_id === deviceId && action.action === target
  if (expectation.type === 'tier1_idle') {
    if (!final) return 'pending'
    return observations.tier1Evaluations > 0 && !observations.tier1Situations.length && !observations.tier1Commands.length ? 'pass' : 'fail'
  }
  if (expectation.type === 'tier1_situation') {
    return observations.tier1Situations.includes(expectation.value) ? 'pass' : missing()
  }
  if (expectation.type === 'tier1_action') {
    const matches = observations.tier1Commands.filter((item) => item.action === expectation.action)
    const selected = expectation.devices.map((id) => matches.find((item) => item.device_id === id))
    if (selected.some((item) => !item)) return missing()
    if (expectation.countdown === 'positive' && selected.some((item) => !item || item.countdown_s <= 0)) return missing()
    if (expectation.countdown === 'zero' && selected.some((item) => !item || item.countdown_s !== 0)) return missing()
    return 'pass'
  }
  if (expectation.type === 'tier1_action_absent') {
    if (!final) return 'pending'
    return observations.tier1Commands.some((item) => actionMatches(item, expectation.deviceId, expectation.action)) ? 'fail' : 'pass'
  }
  if (expectation.type === 'tier2_branch') {
    return observations.tier2Branches.some((branch) => expectation.values.includes(branch)) ? 'pass' : missing()
  }
  if (expectation.type === 'tier2_action') {
    const values = expectation.stage === 'blocked' ? observations.tier2ActionsBlocked
      : expectation.stage === 'received' ? observations.tier2ActionsReceived : observations.tier2ActionsApplied
    const found = values.find((item) => actionMatches(item, expectation.deviceId, expectation.action))
    if (!found || (expectation.countdown === 'positive' && found.countdown_s <= 0)) return missing()
    return 'pass'
  }
  if (expectation.type === 'tier2_action_absent') {
    if (!final) return 'pending'
    return observations.tier2ActionsReceived.some((item) => actionMatches(item, expectation.deviceId, expectation.action)) ? 'fail' : 'pass'
  }
  if (expectation.type === 'tier2_alert') {
    const accepted = expectation.kinds ?? (expectation.kind ? [expectation.kind] : [])
    return observations.tier2Alerts.some((item) => accepted.includes(item.kind)) ? 'pass' : missing()
  }
  if (expectation.type === 'fuzzy_band') {
    return observations.fuzzyBands.some((band) => expectation.values.includes(band))
      ? 'pass' : missing()
  }
  if (expectation.type === 'fuzzy_fallback') {
    return observations.fuzzyFallbackReasons.includes(expectation.value)
      ? 'pass' : missing()
  }
  if (expectation.type === 'counterfactual_branch') {
    return observations.counterfactualBranches.some((branch) => expectation.values.includes(branch))
      ? 'pass' : missing()
  }
  if (expectation.type === 'band_transition') {
    return observations.bandTransitions.some((transition) => expectation.values.includes(transition))
      ? 'pass' : missing()
  }
  if (expectation.type === 'fuzzy_cycle') {
    const cycles = observations.fuzzyCycles
    if (expectation.totalCycles !== undefined) {
      if (cycles.length > expectation.totalCycles) return 'fail'
      if (final && cycles.length !== expectation.totalCycles) return 'fail'
    }
    const cycle = cycles[expectation.cycle - 1]
    if (!cycle) return missing()
    const inRange = (
      value: number | undefined | null,
      range: { min: number; max: number },
    ) => value !== undefined && value !== null
      && value >= range.min && value <= range.max
    if (expectation.mode !== undefined && cycle.mode !== expectation.mode) return missing()
    if (expectation.valid !== undefined && cycle.evaluation.valid !== expectation.valid) return missing()
    if (
      expectation.fallbackReason !== undefined
      && cycle.evaluation.fallback_reason !== expectation.fallbackReason
    ) return missing()
    if (
      expectation.membershipsEmpty !== undefined
      && (Object.keys(cycle.evaluation.memberships).length === 0)
        !== expectation.membershipsEmpty
    ) return missing()
    if (
      expectation.rulesEmpty !== undefined
      && (cycle.evaluation.fired_rules.length === 0) !== expectation.rulesEmpty
    ) return missing()
    for (const [name, range] of Object.entries(expectation.inputs ?? {})) {
      if (range && !inRange(cycle.evaluation.inputs[name], range)) return missing()
    }
    for (const [input, terms] of Object.entries(expectation.memberships ?? {})) {
      for (const [term, range] of Object.entries(terms ?? {})) {
        if (
          range
          && !inRange(cycle.evaluation.memberships[input]?.[term], range)
        ) return missing()
      }
    }
    for (const [band, range] of Object.entries(expectation.aggregation ?? {})) {
      if (
        range
        && !inRange(
          cycle.evaluation.aggregated_strengths[
            band as 'low' | 'watch' | 'high'
          ],
          range,
        )
      ) return missing()
    }
    if (
      expectation.riskScore
      && !inRange(cycle.evaluation.risk_score, expectation.riskScore)
    ) return missing()
    if (expectation.ruleIds) {
      const actual = cycle.evaluation.fired_rules
        .map((rule) => rule.rule_id)
        .sort((a, b) => a - b)
      const required = [...expectation.ruleIds.values].sort((a, b) => a - b)
      const matches = expectation.ruleIds.match === 'exact'
        ? actual.length === required.length
          && actual.every((id, index) => id === required[index])
        : required.every((id) => actual.includes(id))
      if (!matches) return missing()
    }
    if (
      expectation.inferredBand !== undefined
      && cycle.evaluation.inferred_band !== expectation.inferredBand
    ) return missing()
    const controllerBand = cycle.evaluation.controller?.current_band
      ?? cycle.evaluation.risk_band
      ?? null
    if (
      expectation.controllerBand !== undefined
      && controllerBand !== expectation.controllerBand
    ) return missing()
    if (
      expectation.transition !== undefined
      && cycle.evaluation.controller?.transition !== expectation.transition
    ) return missing()
    if (
      expectation.fuzzyBranch !== undefined
      && cycle.fuzzyBranch !== expectation.fuzzyBranch
    ) return missing()
    if (
      expectation.executedBranch !== undefined
      && cycle.executedBranch !== expectation.executedBranch
    ) return missing()
    if (expectation.action) {
      const paths: Record<'fuzzy' | 'executed' | 'counterfactual', FuzzyCycleAction[]> = {
        fuzzy: cycle.fuzzyActions,
        executed: cycle.executedActions,
        counterfactual: cycle.counterfactualActions,
      }
      const target = expectation.action
      const found = paths[target.path].find((action) =>
        (target.deviceId === undefined || action.device_id === target.deviceId)
        && (target.action === undefined || action.action === target.action))
      if (!found) return missing()
      const stageMatches = target.stageMatch === 'visited'
        ? found.stageHistory.includes(target.stage)
        : found.stage === target.stage
      if (!stageMatches) return missing()
    }
    return 'pass'
  }
  if (expectation.type === 'scenario_metric') {
    if (!final || !metrics) return 'pending'
    const value = metrics[expectation.metric]
    return value >= expectation.range.min && value <= expectation.range.max
      ? 'pass'
      : 'fail'
  }
  if (expectation.type === 'backend_error') return observations.backendErrors.length ? 'pass' : missing()
  if (expectation.type === 'breaker_state') {
    if (!final) return 'pending'
    return breakers.find((item) => item.deviceId === expectation.deviceId)?.switchOn === expectation.switchOn ? 'pass' : 'fail'
  }
  return missing()
}

export function evaluateScenario(
  expectations: ScenarioExpectation[],
  observations: ScenarioObservations,
  breakers: SimulatedBreaker[],
  final = false,
  metrics?: ScenarioMetrics,
) {
  return expectations.map((item) => evaluateExpectation(item, observations, breakers, final, metrics))
}
