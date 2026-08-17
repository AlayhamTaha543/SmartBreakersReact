import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { simulatorApi } from '../simulation/api'
import { CHECKPOINT_KEY, cloneConfiguration, defaultBreakers, defaultConfiguration, freshMetrics, freshObservations, loadStoredConfiguration, saveStoredConfiguration } from '../simulation/defaults'
import {
  buildFuzzyDecisionCycle, countdownForAction, decisionActionKey,
  mergeFuzzyDecisionCycle, shouldExecuteBackendAction,
  updateFuzzyDecisionCycleActionStage, updateFuzzyCyclesActionStage,
  upsertFuzzyDecisionCycle,
} from '../simulation/fuzzyDecisionCycle'
import { allowedWeather, breakerDrawW, buildBreakerStatuses, buildTelemetry, pickAutoWeather, stepPhysical, tier1Payload } from '../simulation/physics'
import { CANONICAL_TIER2_ENGINE, tier2DecisionProvenance } from '../simulation/provenance'
import { evaluateScenario } from '../simulation/scenarioEvaluator'
import { differenceMetrics } from '../simulation/scenarioMetrics'
import { scenarios } from '../simulation/scenarios'
import type {
  ClimateRow, Countdown, DashboardSnapshot, EvidenceEvent, EvidenceTier, KBSAction,
  FuzzyActionStage, FuzzyDecisionCycle, KBSAlert, KBSDecision, PhysicalState,
  ScenarioComparison, ScenarioDefinition, ScenarioRunSummary, ScenarioRuntime,
  ScenarioSetup, SimulationCheckpoint, SimulatorConfiguration, Tier2Policy, TierRuntimeState,
} from '../simulation/types'

interface SimulatorContextValue {
  configuration: SimulatorConfiguration
  dashboard: DashboardSnapshot
  climateRows: ClimateRow[]
  cities: string[]
  loading: boolean
  running: boolean
  scenario: ScenarioRuntime
  scenarioDefinition: ScenarioDefinition
  comparison: ScenarioComparison
  saveConfiguration: (next: SimulatorConfiguration) => Promise<void>
  resetConfiguration: () => void
  reloadClimate: () => Promise<void>
  toggleRunning: () => void
  setTierEnabled: (tier: 'T1' | 'T2', enabled: boolean) => void
  toggleBreaker: (deviceId: string, enabled: boolean) => Promise<boolean>
  selectScenario: (id: string) => void
  loadScenario: (id: string) => void
  startScenario: (clean: boolean) => Promise<void>
  runScenarioComparison: () => Promise<void>
  stopScenario: () => void
  updateScenarioSetup: (patch: Partial<ScenarioSetup>) => void
  setScenarioBatteryVoltage: (voltage: number | undefined) => void
}

const initialTier = (enabled = false, policy?: Tier2Policy): TierRuntimeState => ({
  enabled, connected: false, status: enabled ? 'waiting' : 'disabled', engine: null,
  policy, fuzzyEvaluation: null, counterfactual: null, controllerState: null, latestFuzzyCycle: null,
})
const initialScenario = (): ScenarioRuntime => ({
  selectedId: scenarios[0].id, loadedId: null, active: false, completed: false,
  phase: 'NOT LOADED', elapsedRealS: 0, nextEventIndex: 0, startedRealMs: 0,
  startedSimMs: 0, overrides: {}, observations: freshObservations(), results: [],
  metrics: freshMetrics(), lastCommands: {},
  log: [],
})
const initialComparison = (): ScenarioComparison => ({
  status: 'idle', scenarioId: null, crisp: null, fuzzy: null,
  differences: null, error: null,
})
const SimulatorContext = createContext<SimulatorContextValue | null>(null)

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const [configuration, setConfiguration] = useState(loadStoredConfiguration)
  const configRef = useRef(configuration)
  const [climateRows, setClimateRows] = useState<ClimateRow[]>([])
  const climateRef = useRef<ClimateRow[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(true)
  const runningRef = useRef(true)
  const [scenario, setScenario] = useState<ScenarioRuntime>(initialScenario)
  const scenarioRef = useRef(scenario)
  const [scenarioDefinition, setScenarioDefinition] = useState<ScenarioDefinition>(() => structuredClone(scenarios[0]))
  const [comparison, setComparison] = useState<ScenarioComparison>(initialComparison)
  const selectedDefinitionRef = useRef<ScenarioDefinition>(scenarioDefinition)
  const loadedDefinitionRef = useRef<ScenarioDefinition | null>(null)
  const [dashboard, setDashboard] = useState<DashboardSnapshot>(() => ({
    simMs: new Date(configuration.site.localDateTime).getTime(), running: true,
    organization: 'Organization ' + configuration.connections.organization,
    climate: null, climateError: null, weather: configuration.site.manualWeather,
    weatherMode: configuration.site.weatherAuto ? 'CSV AUTO' : 'MANUAL', availableWeather: [],
    flow: null, breakers: structuredClone(configuration.breakers), pvHistory: [], evidence: [],
    alerts: [], countdowns: [], tier1: initialTier(),
    tier2: initialTier(false, configuration.settings.tier2_policy),
    backendWeatherCondition: null, lastBranch: null,
  }))

  const checkpoint = (() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CHECKPOINT_KEY) ?? 'null') as SimulationCheckpoint | null
      return saved?.version === 2 ? saved : null
    } catch { return null }
  })()
  const physicalRef = useRef<PhysicalState>({
    simMs: checkpoint?.simMs ?? new Date(configuration.site.localDateTime).getTime(),
    batterySocWh: checkpoint?.batterySocWh ?? configuration.site.batteryCapacityWh * configuration.site.batterySocPercent / 100,
    heatsinkC: checkpoint?.heatsinkC ?? configuration.site.heatsinkC,
    weather: checkpoint?.weather ?? configuration.site.manualWeather,
    breakers: structuredClone(checkpoint?.breakers ?? configuration.breakers),
    overrides: {},
  })
  const flowRef = useRef<DashboardSnapshot['flow']>(null)
  const climateErrorRef = useRef<string | null>(null)
  const nextWeatherRef = useRef(0)
  const pvHistoryRef = useRef<number[]>([])
  const evidenceRef = useRef<EvidenceEvent[]>([])
  const alertsRef = useRef<KBSAlert[]>([])
  const countdownsRef = useRef<Countdown[]>([])
  const deferredRef = useRef<KBSAction[]>([])
  const processedActionsRef = useRef(new Set<string>())
  const organizationNameRef = useRef('Organization ' + configuration.connections.organization)
  const backendWeatherRef = useRef<string | null>(null)
  const sequenceRef = useRef(0)
  const tier1Ref = useRef<TierRuntimeState>(initialTier())
  const tier2Ref = useRef<TierRuntimeState>(initialTier())
  const tier1BusyRef = useRef(false)
  const tier2BusyRef = useRef(false)
  const pushBusyRef = useRef(false)
  const backendQueueRef = useRef<Promise<void>>(Promise.resolve())
  const lastTier1Ref = useRef(0)
  const lastTier1EvidenceRef = useRef(0)
  const nextPushDueRef = useRef<number | null>(null)
  const lastCycleRef = useRef(0)
  const lastHistoryRef = useRef(0)
  const lastRenderRef = useRef(0)
  const lastTickRef = useRef(performance.now())
  const completionRef = useRef<((summary: ScenarioRunSummary) => void) | null>(null)

  const queueBackend = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const queued = backendQueueRef.current.then(operation)
    backendQueueRef.current = queued.then(() => undefined, () => undefined)
    return queued
  }, [])

  const activeClimate = useCallback(() => {
    const date = new Date(physicalRef.current.simMs)
    return climateRef.current.find((row) => row.city === configRef.current.site.city && row.month === date.getMonth() + 1) ?? null
  }, [])

  const publish = useCallback(() => {
    const row = activeClimate()
    setDashboard({
      simMs: physicalRef.current.simMs, running: runningRef.current,
      organization: organizationNameRef.current, climate: row,
      climateError: climateErrorRef.current, weather: physicalRef.current.weather,
      weatherMode: configRef.current.site.weatherAuto ? 'CSV AUTO' : 'MANUAL',
      availableWeather: row ? allowedWeather(row) : [], flow: flowRef.current,
      breakers: structuredClone(physicalRef.current.breakers),
      pvHistory: [...pvHistoryRef.current], evidence: [...evidenceRef.current],
      alerts: [...alertsRef.current], countdowns: [...countdownsRef.current],
      tier1: { ...tier1Ref.current }, tier2: { ...tier2Ref.current },
      backendWeatherCondition: backendWeatherRef.current,
      lastBranch: tier2Ref.current.branch ?? null,
    })
  }, [activeClimate])

  const evidence = useCallback((tier: EvidenceTier, kind: EvidenceEvent['kind'], message: string, raw?: unknown) => {
    sequenceRef.current += 1
    evidenceRef.current = [{
      id: String(sequenceRef.current), timestamp: new Date(physicalRef.current.simMs).toISOString(),
      tier, kind, message, raw,
    }, ...evidenceRef.current].slice(0, 100)
  }, [])

  const observe = useCallback((kind: string, value: unknown) => {
    const runtime = scenarioRef.current
    if (!runtime.active) return
    const observations = runtime.observations
    if (kind === 'tier1_evaluation') {
      observations.tier1Evaluations += 1
      const situation = String(value ?? '')
      if (situation && !observations.tier1Situations.includes(situation)) observations.tier1Situations.push(situation)
    } else if (kind === 'tier1_command') observations.tier1Commands.push(value as never)
    else if (kind === 'tier2_branch') observations.tier2Branches.push(String(value))
    else if (kind === 'tier2_received') observations.tier2ActionsReceived.push(value as KBSAction)
    else if (kind === 'tier2_applied') observations.tier2ActionsApplied.push(value as KBSAction)
    else if (kind === 'tier2_blocked') observations.tier2ActionsBlocked.push(value as KBSAction)
    else if (kind === 'tier2_alert') observations.tier2Alerts.push(value as KBSAlert)
    else if (kind === 'fuzzy_band') observations.fuzzyBands.push(value as never)
    else if (kind === 'fuzzy_fallback') observations.fuzzyFallbackReasons.push(String(value))
    else if (kind === 'counterfactual_branch') observations.counterfactualBranches.push(String(value))
    else if (kind === 'band_transition') observations.bandTransitions.push(String(value))
    else if (kind === 'fuzzy_cycle') observations.fuzzyCycles = upsertFuzzyDecisionCycle(
      observations.fuzzyCycles, value as FuzzyDecisionCycle)
    else if (kind === 'backend_error') observations.backendErrors.push(String(value))
    const definition = loadedDefinitionRef.current?.id === runtime.loadedId ? loadedDefinitionRef.current : null
    runtime.results = definition ? evaluateScenario(definition.expectations, observations, physicalRef.current.breakers, false, runtime.metrics) : []
    setScenario({ ...runtime, observations: { ...observations }, results: [...runtime.results] })
  }, [])

  const recordFuzzyCycle = useCallback((decision: KBSDecision) => {
    const incoming = buildFuzzyDecisionCycle(decision)
    if (!incoming) return
    const current = tier2Ref.current.latestFuzzyCycle
    const next = current?.decisionId === incoming.decisionId
      ? mergeFuzzyDecisionCycle(current, incoming)
      : incoming
    tier2Ref.current.latestFuzzyCycle = next
    observe('fuzzy_cycle', next)
  }, [observe])

  const updateFuzzyActionStage = useCallback((
    decisionId: string,
    actionId: number,
    stage: FuzzyActionStage,
    action?: KBSAction,
  ) => {
    const latest = tier2Ref.current.latestFuzzyCycle
    if (latest) {
      tier2Ref.current.latestFuzzyCycle = updateFuzzyDecisionCycleActionStage(
        latest, decisionId, actionId, stage, action,
      )
    }
    const runtime = scenarioRef.current
    if (!runtime.active) return
    runtime.observations.fuzzyCycles = updateFuzzyCyclesActionStage(
      runtime.observations.fuzzyCycles,
      decisionId,
      actionId,
      stage,
      action,
    )
    const definition = loadedDefinitionRef.current?.id === runtime.loadedId
      ? loadedDefinitionRef.current
      : null
    runtime.results = definition
      ? evaluateScenario(
        definition.expectations,
        runtime.observations,
        physicalRef.current.breakers,
        false,
        runtime.metrics,
      )
      : []
    setScenario({
      ...runtime,
      observations: { ...runtime.observations },
      results: [...runtime.results],
    })
  }, [])

  const reloadClimate = useCallback(async () => {
    setLoading(true)
    try {
      const response = await simulatorApi.climate(configRef.current.connections.backendUrl)
      if (response.rows.length !== 84 || response.cities.length !== 7) throw new Error('Climate API did not return 7 cities × 12 months')
      climateRef.current = response.rows
      setClimateRows(response.rows)
      setCities(response.cities)
      climateErrorRef.current = null
      const row = activeClimate()
      if (!row) throw new Error('No CSV climate row exists for the selected city and month')
      if (configRef.current.site.weatherAuto) physicalRef.current.weather = row.typical_weather
      nextWeatherRef.current = physicalRef.current.simMs + (30 + Math.random() * 60) * 60_000
    } catch (error) {
      climateRef.current = []
      setClimateRows([])
      setCities([])
      climateErrorRef.current = error instanceof Error ? error.message : 'Climate data unavailable'
    } finally {
      setLoading(false)
      publish()
    }
  }, [activeClimate, publish])

  useEffect(() => { void reloadClimate() }, [reloadClimate])

  const acknowledge = useCallback(async (actionId: number) => {
    try {
      await queueBackend(() => simulatorApi.ack(configRef.current.connections.backendUrl, [actionId]))
      evidence('EXEC', 'ACK', 'Acknowledged Tier-2 action #' + actionId + ' after local execution')
    } catch (error) {
      evidence('EXEC', 'ERROR', 'ACK failed for action #' + actionId + ': ' + (error instanceof Error ? error.message : String(error)))
    }
  }, [evidence, queueBackend])

  const applySwitch = useCallback((
    deviceId: string,
    enabled: boolean,
    source: 'T1' | 'T2' | 'MANUAL',
    action?: KBSAction,
    decisionId?: string,
  ) => {
    const breaker = physicalRef.current.breakers.find((item) => item.deviceId === deviceId)
    if (!breaker) {
      if (source === 'T2' && action) updateFuzzyActionStage(
        decisionId ?? action.decision_event_id, action.id, 'failed', action,
      )
      evidence('EXEC', 'ERROR', 'No local breaker exists for ' + deviceId, action)
      return false
    }
    const runtime = scenarioRef.current
    if (runtime.active && source !== 'MANUAL') {
      runtime.metrics.actionCount += 1
      if (runtime.lastCommands[deviceId] && runtime.lastCommands[deviceId] !== (enabled ? 'on' : 'off')) {
        runtime.metrics.commandReversals += 1
      }
      runtime.lastCommands[deviceId] = enabled ? 'on' : 'off'
      if (!enabled && breaker.priorityType === 'mandatory') {
        runtime.metrics.mandatoryOffCommands += 1
      }
    }
    breaker.switchOn = enabled
    breaker.countdownS = 0
    breaker.onSinceMs = enabled ? physicalRef.current.simMs : null
    if (enabled) { breaker.lockedOut = false; breaker.lockoutReason = '' }
    if (source === 'T1' && !enabled) { breaker.lockedOut = true; breaker.lockoutReason = tier1Ref.current.situation || 'Tier-1 safety' }
    evidence('EXEC', 'COMMAND', source + ' applied ' + deviceId + ' ' + (enabled ? 'ON' : 'OFF'), action)
    if (source === 'T2' && action) {
      observe('tier2_applied', action)
      updateFuzzyActionStage(
        decisionId ?? action.decision_event_id, action.id, 'applied', action,
      )
      void acknowledge(action.id)
    }
    return true
  }, [acknowledge, evidence, observe, updateFuzzyActionStage])

  const drainDeferred = useCallback(() => {
    if (tier1Ref.current.situation || !deferredRef.current.length) return
    const waiting = [...deferredRef.current]
    deferredRef.current = []
    for (const action of waiting) {
      applySwitch(action.device_id, action.action === 'on', 'T2', action, action.decision_event_id)
    }
  }, [applySwitch])

  const handleTier2Actions = useCallback((actions: KBSAction[]) => {
    for (const action of actions) {
      const decisionId = action.decision_event_id
      if (!decisionId) {
        evidence('T2', 'ERROR', 'Ignored action without a decision event ID', action)
        continue
      }
      const actionKey = decisionActionKey(decisionId, action.id)
      if (processedActionsRef.current.has(actionKey)) continue
      processedActionsRef.current.add(actionKey)
      if (!shouldExecuteBackendAction(action)) {
        evidence('T2', 'INFO', 'Retained resolved Tier-2 action without local execution', action)
        continue
      }
      observe('tier2_received', action)
      updateFuzzyActionStage(decisionId, action.id, 'received', action)
      evidence('T2', 'COMMAND', action.device_id + ' → ' + action.action.toUpperCase() + (action.countdown_s ? ' in ' + action.countdown_s + ' simulated seconds' : ''), action)
      if (action.countdown_s > 0) {
        const countdown = countdownForAction(action, decisionId, physicalRef.current.simMs)
        if (!countdownsRef.current.some((item) => item.key === countdown.key)) {
          countdownsRef.current.push(countdown)
        }
        updateFuzzyActionStage(decisionId, action.id, 'scheduled', action)
        continue
      }
      const breaker = physicalRef.current.breakers.find((item) => item.deviceId === action.device_id)
      if (action.action === 'on' && breaker?.priorityType !== 'ac_grid' && tier1Ref.current.situation) {
        deferredRef.current.push(action)
        updateFuzzyActionStage(decisionId, action.id, 'held_by_tier1', action)
        observe('tier2_blocked', action)
        evidence('EXEC', 'INFO', 'Tier-2 ON held pending while Tier-1 danger is active', action)
        continue
      }
      applySwitch(action.device_id, action.action === 'on', 'T2', action, decisionId)
    }
  }, [applySwitch, evidence, observe, updateFuzzyActionStage])

  const recordTier2Decision = useCallback((decision: KBSDecision) => {
    recordFuzzyCycle(decision)
    tier2Ref.current.policy = decision.policy ?? configRef.current.settings.tier2_policy
    const fuzzy = decision.fuzzy_evaluation?.profile_version
      ? decision.fuzzy_evaluation : null
    tier2Ref.current.fuzzyEvaluation = fuzzy
    tier2Ref.current.counterfactual = decision.counterfactual?.branch !== undefined
      ? decision.counterfactual : null
    if (fuzzy) {
      if (fuzzy.risk_band) observe('fuzzy_band', fuzzy.risk_band)
      if (fuzzy.fallback_reason) observe('fuzzy_fallback', fuzzy.fallback_reason)
      if (fuzzy.controller?.transition) observe('band_transition', fuzzy.controller.transition)
      evidence(
        'T2', fuzzy.valid ? 'FACT' : 'INFO',
        fuzzy.valid
          ? 'Fuzzy ' + fuzzy.profile_version + ': risk ' + Number(fuzzy.risk_score).toFixed(1) + ' · ' + (fuzzy.risk_band ?? 'unbanded')
          : 'Fuzzy fallback: ' + fuzzy.fallback_reason,
        fuzzy,
      )
    }
    if (decision.counterfactual?.branch) {
      observe('counterfactual_branch', decision.counterfactual.branch)
      evidence(
        'T2', 'INFO',
        'Counterfactual ' + (decision.counterfactual.policy ?? 'policy') + ': ' + decision.counterfactual.branch,
        decision.counterfactual,
      )
    }
  }, [evidence, observe, recordFuzzyCycle])

  const refreshState = useCallback(async (executePending = true) => {
    const state = await queueBackend(() => simulatorApi.state(configRef.current.connections.backendUrl, configRef.current.connections.organization))
    if (state.organization) organizationNameRef.current = state.organization.name
    const provenance = tier2DecisionProvenance(state.latest_decision)
    if (state.latest_decision) {
      tier2Ref.current.engine = state.latest_decision.engine
      tier2Ref.current.branch = state.latest_decision.branch
      if (provenance === 'legacy') tier2Ref.current.status = 'legacy decision — detailed path unavailable'
      recordFuzzyCycle(state.latest_decision)
      const weather = state.latest_decision.facts?.weather_condition
      backendWeatherRef.current = weather === undefined ? null : String(weather)
    }
    tier2Ref.current.policy = state.policy ?? state.latest_decision?.policy ?? configRef.current.settings.tier2_policy
    tier2Ref.current.fuzzyEvaluation = state.fuzzy_evaluation?.profile_version
      ? state.fuzzy_evaluation : null
    tier2Ref.current.counterfactual = state.counterfactual?.branch !== undefined
      ? state.counterfactual : null
    tier2Ref.current.controllerState = state.controller_state ?? null
    if (executePending) handleTier2Actions(state.pending_actions)
    const known = new Set(alertsRef.current.map((item) => item.created_at + item.kind))
    for (const alert of state.recent_alerts) {
      if (!known.has(alert.created_at + alert.kind)) {
        alertsRef.current.unshift(alert)
        evidence('T2', 'ALERT', alert.kind + ': ' + alert.message, alert)
        observe('tier2_alert', alert)
      }
    }
    alertsRef.current = alertsRef.current.slice(0, 20)
  }, [evidence, handleTier2Actions, observe, queueBackend, recordFuzzyCycle])

  useEffect(() => {
    void refreshState(false)
      .then(publish)
      .catch((error) => evidence(
        'T2', 'ERROR', 'Initial Tier-2 state unavailable: ' + String(error),
      ))
  }, [evidence, publish, refreshState])

  const evaluateTier1 = useCallback(async () => {
    const flow = flowRef.current
    if (!flow || tier1BusyRef.current || !tier1Ref.current.enabled) return
    tier1BusyRef.current = true
    try {
      const result = await simulatorApi.tier1(configRef.current.connections.tier1Url, tier1Payload(flow, physicalRef.current, configRef.current.site))
      if (result.engine !== 'edge.tier1_kbs.evaluate' || !result.facts) throw new Error('Tier-1 bridge did not return real-engine provenance/facts')
      const prior = tier1Ref.current.situation ?? ''
      tier1Ref.current = { ...tier1Ref.current, connected: true, status: 'evaluated', engine: result.engine, situation: result.situation ?? '' }
      observe('tier1_evaluation', result.situation ?? '')
      const now = performance.now()
      if (result.situation !== prior || now - lastTier1EvidenceRef.current > 5000) {
        evidence('T1', 'FACT', 'Real Tier-1 fact snapshot', result.facts)
        evidence('T1', 'RULE', result.situation ? 'Rule fired: ' + result.situation : 'No Tier-1 safety rule fired', { engine: result.engine })
        lastTier1EvidenceRef.current = now
      }
      for (const command of result.commands) {
        observe('tier1_command', command)
        if (command.countdown_s > 0) {
          const key = 'T1-' + command.device_id + '-' + command.reason
          if (!countdownsRef.current.some((item) => item.key === key)) {
            countdownsRef.current.push({ key, source: 'T1', deviceId: command.device_id, fireAtSimMs: physicalRef.current.simMs + command.countdown_s * 1000, reason: command.reason })
          }
        } else applySwitch(command.device_id, command.action === 'on', 'T1')
      }
      if (prior && !result.situation) drainDeferred()
    } catch (error) {
      tier1Ref.current = { ...tier1Ref.current, connected: false, status: error instanceof Error ? error.message : String(error) }
      evidence('T1', 'ERROR', 'Tier-1 unavailable: ' + tier1Ref.current.status)
    } finally { tier1BusyRef.current = false }
  }, [applySwitch, drainDeferred, evidence, observe])

  const runTier2 = useCallback(async () => {
    if (tier2BusyRef.current || !tier2Ref.current.enabled) return
    tier2BusyRef.current = true
    try {
      const result = await queueBackend(() => simulatorApi.runCycle(
        scenarioRef.current.active && loadedDefinitionRef.current?.setup.backendOffline ? 'http://127.0.0.1:8999' : configRef.current.connections.backendUrl,
        configRef.current.connections.organization,
      ))
      if (result.engine !== CANONICAL_TIER2_ENGINE) throw new Error('Unexpected Tier-2 engine provenance')
      tier2Ref.current = { ...tier2Ref.current, connected: true, status: result.detail ?? 'cycle complete', engine: result.engine, branch: result.branch }
      recordTier2Decision(result)
      if (result.branch) {
        observe('tier2_branch', result.branch)
        evidence('T2', 'RULE', 'Real Tier-2 branch: ' + result.branch, result.facts)
      }
      handleTier2Actions(result.actions ?? [])
      await refreshState()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      tier2Ref.current = { ...tier2Ref.current, connected: false, status: message }
      evidence('T2', 'ERROR', 'Tier-2 unavailable: ' + message)
      observe('backend_error', message)
    } finally { tier2BusyRef.current = false }
  }, [evidence, handleTier2Actions, observe, queueBackend, recordTier2Decision, refreshState])

  const pushTelemetry = useCallback(async () => {
    const flow = flowRef.current
    if (!flow || pushBusyRef.current || !tier2Ref.current.enabled) return
    pushBusyRef.current = true
    try {
      const baseUrl = scenarioRef.current.active && loadedDefinitionRef.current?.setup.backendOffline ? 'http://127.0.0.1:8999' : configRef.current.connections.backendUrl
      await queueBackend(() => simulatorApi.push(baseUrl,
        buildTelemetry(flow, configRef.current.site, configRef.current.connections.organization, physicalRef.current.simMs),
        buildBreakerStatuses(physicalRef.current.breakers, physicalRef.current.simMs)))
      tier2Ref.current.status = 'telemetry pushed'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      tier2Ref.current.connected = false
      tier2Ref.current.status = message
      observe('backend_error', message)
    } finally { pushBusyRef.current = false }
  }, [observe, queueBackend])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const realNow = performance.now()
      const realDtS = Math.min((realNow - lastTickRef.current) / 1000, 1)
      lastTickRef.current = realNow
      const row = activeClimate()
      if (runningRef.current && row) {
        physicalRef.current.simMs += realDtS * configRef.current.site.scale * 1000
        const runtime = scenarioRef.current
        if (runtime.active) {
          const definition = loadedDefinitionRef.current?.id === runtime.loadedId ? loadedDefinitionRef.current : null
          const elapsedSimS = (physicalRef.current.simMs - runtime.startedSimMs) / 1000
          while (definition && runtime.nextEventIndex < definition.events.length && elapsedSimS >= definition.events[runtime.nextEventIndex].atSimS) {
            const event = definition.events[runtime.nextEventIndex]
            Object.assign(physicalRef.current.overrides, event.changes.overrides ?? {})
            if (event.changes.state?.gridAvailable !== undefined) configRef.current.site.gridAvailable = event.changes.state.gridAvailable
            for (const [deviceId, patch] of Object.entries(event.changes.breakers ?? {})) {
              const breaker = physicalRef.current.breakers.find((item) => item.deviceId === deviceId)
              if (breaker) {
                if (patch.switchOn && !breaker.switchOn) patch.onSinceMs = physicalRef.current.simMs
                Object.assign(breaker, patch)
              }
            }
            runtime.phase = event.phase
            runtime.log.unshift({ timestamp: new Date(physicalRef.current.simMs).toISOString(), message: event.label })
            runtime.nextEventIndex += 1
          }
          runtime.elapsedRealS = (realNow - runtime.startedRealMs) / 1000
          if (definition && runtime.elapsedRealS >= definition.durationRealS) {
            runtime.active = false
            runtime.completed = true
            runtime.phase = 'FINISHED'
            runtime.results = evaluateScenario(definition.expectations, runtime.observations, physicalRef.current.breakers, true, runtime.metrics)
            tier1Ref.current = initialTier(false)
            tier2Ref.current = initialTier(false, configRef.current.settings.tier2_policy)
            const resolveCompletion = completionRef.current
            completionRef.current = null
            if (resolveCompletion) {
              const summary: ScenarioRunSummary = {
                policy: configRef.current.settings.tier2_policy,
                metrics: { ...runtime.metrics },
                results: [...runtime.results],
              }
              window.setTimeout(() => resolveCompletion(summary), 0)
            }
          }
          setScenario({
            ...runtime, observations: { ...runtime.observations },
            results: [...runtime.results], metrics: { ...runtime.metrics },
            lastCommands: { ...runtime.lastCommands }, log: [...runtime.log],
          })
        }
        if (configRef.current.site.weatherAuto && physicalRef.current.simMs >= nextWeatherRef.current) {
          physicalRef.current.weather = pickAutoWeather(row, new Date(physicalRef.current.simMs))
          nextWeatherRef.current = physicalRef.current.simMs + (30 + Math.random() * 60) * 60_000
        } else if (!configRef.current.site.weatherAuto) physicalRef.current.weather = configRef.current.site.manualWeather
        flowRef.current = stepPhysical(physicalRef.current, configRef.current.site, row, realDtS * configRef.current.site.scale)
        if (runtime.active && flowRef.current) {
          const simDtS = realDtS * configRef.current.site.scale
          const metrics = runtime.metrics
          metrics.gridImportWh += (
            flowRef.current.gridSupplying ? flowRef.current.loadW : 0
          ) * simDtS / 3600
          metrics.minimumBatterySocPercent = Math.min(
            metrics.minimumBatterySocPercent, flowRef.current.socFrac * 100,
          )
          if (
            flowRef.current.socFrac * 100
            < (configRef.current.settings.night_reserve_percent ?? 30)
          ) metrics.timeBelowReserveS += simDtS
          const optionalW = physicalRef.current.breakers.reduce(
            (sum, breaker) => sum + (
              breaker.priorityType === 'normal' || breaker.priorityType === 'comfort'
                ? breakerDrawW(breaker, physicalRef.current.simMs) : 0
            ),
            0,
          )
          metrics.optionalLoadServedWh += optionalW * simDtS / 3600
        }
        for (const countdown of [...countdownsRef.current]) {
          const breaker = physicalRef.current.breakers.find((item) => item.deviceId === countdown.deviceId)
          if (breaker) breaker.countdownS = Math.max(0, Math.ceil((countdown.fireAtSimMs - physicalRef.current.simMs) / 1000))
          if (physicalRef.current.simMs >= countdown.fireAtSimMs) {
            countdownsRef.current = countdownsRef.current.filter((item) => item.key !== countdown.key)
            if (countdown.action) {
              applySwitch(
                countdown.action.device_id,
                countdown.action.action === 'on',
                'T2',
                countdown.action,
                countdown.decisionId,
              )
            } else if (breaker) {
              applySwitch(countdown.deviceId, false, countdown.source)
            }
          }
        }
        if (realNow - lastHistoryRef.current >= 1000) {
          pvHistoryRef.current = [...pvHistoryRef.current, flowRef.current.pvW].slice(-96)
          lastHistoryRef.current = realNow
        }
      }
      if (tier1Ref.current.enabled && realNow - lastTier1Ref.current >= 500) {
        lastTier1Ref.current = realNow
        void evaluateTier1()
      }
      const pushIntervalMs = (scenarioRef.current.active ? loadedDefinitionRef.current?.setup.pushIntervalS ?? 1 : 1) * 1000
      const pushDue = nextPushDueRef.current
      if (tier2Ref.current.enabled && pushDue !== null && realNow >= pushDue) {
        const followingDue = pushDue + pushIntervalMs
        nextPushDueRef.current = followingDue > realNow
          ? followingDue
          : realNow + pushIntervalMs
        void pushTelemetry()
      }
      if (tier2Ref.current.enabled && realNow - lastCycleRef.current >= configRef.current.settings.cycle_seconds * 1000) {
        lastCycleRef.current = realNow
        void runTier2()
      }
      if (realNow - lastRenderRef.current >= 250) { lastRenderRef.current = realNow; publish() }
    }, 100)
    return () => window.clearInterval(timer)
  }, [activeClimate, applySwitch, evaluateTier1, publish, pushTelemetry, runTier2])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const checkpoint: SimulationCheckpoint = {
        version: 2, savedAt: new Date().toISOString(), simMs: physicalRef.current.simMs,
        batterySocWh: physicalRef.current.batterySocWh, heatsinkC: physicalRef.current.heatsinkC,
        weather: physicalRef.current.weather, breakers: physicalRef.current.breakers,
      }
      window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint))
    }, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const reinitialize = useCallback((next: SimulatorConfiguration) => {
    configRef.current = next
    setConfiguration(next)
    saveStoredConfiguration(next)
    physicalRef.current = {
      simMs: new Date(next.site.localDateTime).getTime(),
      batterySocWh: next.site.batteryCapacityWh * next.site.batterySocPercent / 100,
      heatsinkC: next.site.heatsinkC, weather: next.site.manualWeather,
      breakers: structuredClone(next.breakers), overrides: {},
    }
    pvHistoryRef.current = []
    countdownsRef.current = []
    deferredRef.current = []
    processedActionsRef.current.clear()
    const row = activeClimate()
    if (next.site.weatherAuto && row) physicalRef.current.weather = row.typical_weather
    nextWeatherRef.current = 0
    publish()
  }, [activeClimate, publish])

  const saveConfiguration = useCallback(async (next: SimulatorConfiguration) => {
    const synchronized = cloneConfiguration(next)
    synchronized.settings = {
      ...synchronized.settings,
      battery_capacity_Wh: synchronized.site.batteryCapacityWh,
      max_inverter_power_W: synchronized.site.maxInverterW,
    }
    reinitialize(synchronized)
    await queueBackend(() => simulatorApi.settings(
      synchronized.connections.backendUrl,
      synchronized.connections.organization,
      synchronized.settings,
    ))
    await reloadClimate()
  }, [queueBackend, reinitialize, reloadClimate])

  const resetConfiguration = useCallback(() => reinitialize(cloneConfiguration(defaultConfiguration)), [reinitialize])

  const setTierEnabled = useCallback((tier: 'T1' | 'T2', enabled: boolean) => {
    if (tier === 'T1') {
      tier1Ref.current = initialTier(enabled)
      if (!enabled) { tier1Ref.current.situation = ''; drainDeferred() }
      lastTier1Ref.current = 0
    } else {
      tier2Ref.current = initialTier(enabled, configRef.current.settings.tier2_policy)
      nextPushDueRef.current = enabled ? performance.now() : null
      lastCycleRef.current = performance.now()
    }
    publish()
  }, [drainDeferred, publish])

  const toggleBreaker = useCallback(async (deviceId: string, enabled: boolean) => {
    const breaker = physicalRef.current.breakers.find((item) => item.deviceId === deviceId)
    if (!breaker) return false
    if (enabled && breaker.priorityType !== 'ac_grid' && tier1Ref.current.situation) {
      evidence('EXEC', 'INFO', 'Manual ON blocked by active Tier-1 danger for ' + deviceId)
      publish()
      return false
    }
    applySwitch(deviceId, enabled, 'MANUAL')
    try {
      await queueBackend(() => simulatorApi.breakerOverride(configRef.current.connections.backendUrl, configRef.current.connections.organization, deviceId, enabled, new Date(physicalRef.current.simMs).toISOString()))
    } catch (error) {
      evidence('EXEC', 'ERROR', 'Backend override sync failed: ' + (error instanceof Error ? error.message : String(error)))
    }
    publish()
    return true
  }, [applySwitch, evidence, publish, queueBackend])

  const selectScenario = useCallback((id: string) => {
    const definition = scenarios.find((item) => item.id === id)
    if (!definition) return
    const selected = structuredClone(definition)
    selectedDefinitionRef.current = selected
    setScenarioDefinition(selected)
    scenarioRef.current = { ...scenarioRef.current, selectedId: id }
    setScenario(scenarioRef.current)
  }, [])

  const updateScenarioSetup = useCallback((patch: Partial<ScenarioSetup>) => {
    const next = structuredClone(selectedDefinitionRef.current)
    next.setup = {
      ...next.setup,
      ...patch,
      overrides: patch.overrides ? { ...next.setup.overrides, ...patch.overrides } : next.setup.overrides,
    }
    selectedDefinitionRef.current = next
    setScenarioDefinition(next)
    if (scenarioRef.current.loadedId === next.id) {
      loadedDefinitionRef.current = null
      scenarioRef.current = {
        ...scenarioRef.current, loadedId: null, active: false, completed: false,
        phase: 'SETUP EDITED · APPLY REQUIRED', results: [],
      }
      setScenario(scenarioRef.current)
    }
  }, [])

  const loadScenario = useCallback((id: string) => {
    const source = selectedDefinitionRef.current.id === id
      ? selectedDefinitionRef.current
      : scenarios.find((item) => item.id === id)
    if (!source) return
    const definition = structuredClone(source)
    loadedDefinitionRef.current = definition
    selectedDefinitionRef.current = structuredClone(definition)
    setScenarioDefinition(selectedDefinitionRef.current)
    const setup = definition.setup
    const next = cloneConfiguration(configRef.current)
    next.site = {
      ...next.site, localDateTime: setup.localDateTime,
      city: setup.city ?? next.site.city, scale: setup.scale ?? next.site.scale,
      manualWeather: setup.manualWeather ?? next.site.manualWeather, weatherAuto: setup.weatherAuto ?? false,
      maxPvW: setup.maxPvW ?? next.site.maxPvW, pvThresholdW: setup.pvThresholdW ?? next.site.pvThresholdW,
      maxInverterW: setup.maxInverterW ?? next.site.maxInverterW, gridAvailable: setup.gridAvailable ?? true,
      batteryCapacityWh: setup.batteryCapacityWh ?? next.site.batteryCapacityWh,
      batterySocPercent: setup.batterySocPercent ?? next.site.batterySocPercent,
      batteryNominalV: setup.batteryNominalV ?? next.site.batteryNominalV,
      batteryFloorV: setup.batteryFloorV ?? next.site.batteryFloorV,
      heatsinkC: setup.heatsinkC ?? next.site.heatsinkC,
    }
    next.breakers = setup.breakers.map((item) => ({
      ...(defaultBreakers.find((value) => value.deviceId === item.deviceId) ?? defaultBreakers[0]),
      ...item,
    }))
    next.settings = {
      ...next.settings,
      cycle_seconds: setup.tier2CycleS,
      power_saving: setup.powerSaving,
      tier2_policy: setup.tier2Policy ?? next.settings.tier2_policy,
      battery_low_voltage_V: next.site.batteryFloorV,
      battery_capacity_Wh: next.site.batteryCapacityWh,
      max_inverter_power_W: next.site.maxInverterW,
    }
    reinitialize(next)
    physicalRef.current.overrides = { ...(setup.overrides ?? {}) }
    tier1Ref.current = initialTier(false)
    tier2Ref.current = initialTier(false, next.settings.tier2_policy)
    const runtime: ScenarioRuntime = {
      selectedId: id, loadedId: id, active: false, completed: false,
      phase: definition.events.length ? 'BEFORE DISTURBANCE' : 'MONITORING',
      elapsedRealS: 0, nextEventIndex: 0, startedRealMs: 0, startedSimMs: 0,
      overrides: { ...(setup.overrides ?? {}) }, observations: freshObservations(),
      results: definition.expectations.map(() => 'pending'),
      metrics: {
        ...freshMetrics(),
        minimumBatterySocPercent: next.site.batterySocPercent,
      },
      lastCommands: {},
      log: [{ timestamp: new Date(physicalRef.current.simMs).toISOString(), message: 'Loaded ' + definition.name }],
    }
    scenarioRef.current = runtime
    setScenario(runtime)
    publish()
  }, [publish, reinitialize])

  const startScenario = useCallback(async (clean: boolean, policyOverride?: Tier2Policy) => {
    const definition = loadedDefinitionRef.current?.id === scenarioRef.current.loadedId
      ? loadedDefinitionRef.current
      : null
    if (!definition) throw new Error('Load a scenario first')
    const selectedPolicy = (
      policyOverride
      ?? definition.setup.tier2Policy
      ?? configRef.current.settings.tier2_policy
    )
    configRef.current.settings.tier2_policy = selectedPolicy
    tier2Ref.current.policy = selectedPolicy
    if (clean) await queueBackend(() => simulatorApi.reset(configRef.current.connections.backendUrl, configRef.current.connections.organization))
    await queueBackend(() => simulatorApi.settings(configRef.current.connections.backendUrl, configRef.current.connections.organization, {
      ...configRef.current.settings,
      data_source: 'simulator', mode: 'active',
      cycle_seconds: definition.setup.tier2CycleS,
      power_saving: definition.setup.powerSaving,
      tier2_policy: selectedPolicy,
      battery_capacity_Wh: configRef.current.site.batteryCapacityWh,
      max_inverter_power_W: configRef.current.site.maxInverterW,
    }))
    if (definition.setup.tier2) {
      const settledAt = physicalRef.current.simMs - 60 * 60_000
      for (const breaker of physicalRef.current.breakers) {
        if (breaker.switchOn) {
          await queueBackend(() => simulatorApi.breakerOverride(
            configRef.current.connections.backendUrl, configRef.current.connections.organization,
            breaker.deviceId, false, new Date(settledAt - 1000).toISOString(),
          ))
        }
        await queueBackend(() => simulatorApi.breakerOverride(
          configRef.current.connections.backendUrl, configRef.current.connections.organization,
          breaker.deviceId, breaker.switchOn,
          new Date(breaker.switchOn ? settledAt : physicalRef.current.simMs).toISOString(),
        ))
      }
    }
    const runtime = scenarioRef.current
    runtime.active = true
    runtime.completed = false
    runtime.startedRealMs = performance.now()
    runtime.startedSimMs = physicalRef.current.simMs
    runtime.nextEventIndex = 0
    runtime.observations = freshObservations()
    runtime.results = definition.expectations.map(() => 'pending')
    runtime.metrics = {
      ...freshMetrics(),
      minimumBatterySocPercent: physicalRef.current.batterySocWh
        / configRef.current.site.batteryCapacityWh * 100,
    }
    runtime.lastCommands = {}
    runtime.log.unshift({ timestamp: new Date(physicalRef.current.simMs).toISOString(), message: 'Scenario started' })
    scenarioRef.current = runtime
    setScenario({ ...runtime })
    runningRef.current = true
    setRunning(true)
    setTierEnabled('T1', definition.setup.tier1)
    setTierEnabled('T2', definition.setup.tier2)
  }, [queueBackend, setTierEnabled])

  const runScenarioComparison = useCallback(async () => {
    const definition = loadedDefinitionRef.current?.id === scenarioRef.current.loadedId
      ? loadedDefinitionRef.current : null
    if (!definition) throw new Error('Load a scenario first')
    if (!definition.setup.tier2) throw new Error('Comparison requires Tier-2 to be enabled')
    const originalPolicy = configRef.current.settings.tier2_policy
    const run = async (policy: 'crisp' | 'fuzzy_active') => {
      loadScenario(definition.id)
      const completion = new Promise<ScenarioRunSummary>((resolve) => {
        completionRef.current = resolve
      })
      await startScenario(true, policy)
      return completion
    }
    setComparison({
      status: 'running_crisp', scenarioId: definition.id,
      crisp: null, fuzzy: null, differences: null, error: null,
    })
    try {
      const crisp = await run('crisp')
      setComparison({
        status: 'running_fuzzy', scenarioId: definition.id,
        crisp, fuzzy: null, differences: null, error: null,
      })
      const fuzzy = await run('fuzzy_active')
      setComparison({
        status: 'complete', scenarioId: definition.id,
        crisp, fuzzy, differences: differenceMetrics(crisp.metrics, fuzzy.metrics),
        error: null,
      })
    } catch (error) {
      completionRef.current = null
      setComparison({
        status: 'error', scenarioId: definition.id,
        crisp: null, fuzzy: null, differences: null,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      configRef.current.settings.tier2_policy = originalPolicy
      setConfiguration(cloneConfiguration(configRef.current))
      saveStoredConfiguration(configRef.current)
      await queueBackend(() => simulatorApi.settings(
        configRef.current.connections.backendUrl,
        configRef.current.connections.organization,
        { tier2_policy: originalPolicy },
      ))
    }
  }, [loadScenario, queueBackend, startScenario])

  const stopScenario = useCallback(() => {
    const runtime = scenarioRef.current
    runtime.active = false
    runtime.completed = false
    runtime.phase = 'STOPPED'
    scenarioRef.current = runtime
    setScenario({ ...runtime })
    setTierEnabled('T1', false)
    setTierEnabled('T2', false)
  }, [setTierEnabled])

  const setScenarioBatteryVoltage = useCallback((voltage: number | undefined) => {
    const withVoltage = (source: ScenarioDefinition) => {
      const definition = structuredClone(source)
      if (definition.batteryControl?.source === 'event') {
        const index = definition.batteryControl.eventIndex ?? 0
        const event = definition.events[index]
        if (event) {
          event.changes.overrides = { ...event.changes.overrides, batteryVoltageV: voltage }
          if (definition.batteryControl.eventLabel && voltage !== undefined) {
            event.label = definition.batteryControl.eventLabel + ': ' + voltage + ' V'
          }
        }
      } else {
        definition.setup.overrides = { ...definition.setup.overrides, batteryVoltageV: voltage }
      }
      return definition
    }

    const selected = withVoltage(selectedDefinitionRef.current)
    selectedDefinitionRef.current = selected
    setScenarioDefinition(selected)

    if (scenarioRef.current.loadedId === selected.id && loadedDefinitionRef.current) {
      const loaded = withVoltage(loadedDefinitionRef.current)
      loadedDefinitionRef.current = loaded
      if (loaded.batteryControl?.source !== 'event') {
        if (voltage === undefined) delete physicalRef.current.overrides.batteryVoltageV
        else physicalRef.current.overrides.batteryVoltageV = voltage
        scenarioRef.current.overrides = { ...scenarioRef.current.overrides, batteryVoltageV: voltage }
      }
      setScenario({ ...scenarioRef.current, overrides: { ...scenarioRef.current.overrides } })
      publish()
    }
  }, [publish])

  return (
    <SimulatorContext.Provider value={{
      configuration, dashboard, climateRows, cities, loading, running,
      scenario, scenarioDefinition, comparison,
      saveConfiguration, resetConfiguration, reloadClimate,
      toggleRunning() { runningRef.current = !runningRef.current; setRunning(runningRef.current); publish() },
      setTierEnabled, toggleBreaker, selectScenario, loadScenario, startScenario,
      runScenarioComparison,
      stopScenario, updateScenarioSetup, setScenarioBatteryVoltage,
    }}>
      {children}
    </SimulatorContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSimulator() {
  const value = useContext(SimulatorContext)
  if (!value) throw new Error('useSimulator must be used inside SimulatorProvider')
  return value
}
