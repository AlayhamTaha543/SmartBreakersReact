import type { ScenarioExpectation, ScenarioObservations, SimulatedBreaker } from './types'

export type ExpectationResult = 'pending' | 'pass' | 'fail'

export function evaluateExpectation(
  expectation: ScenarioExpectation,
  observations: ScenarioObservations,
  breakers: SimulatedBreaker[],
  final = false,
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
) {
  return expectations.map((item) => evaluateExpectation(item, observations, breakers, final))
}
