export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'storm' | 'foggy'
export type ClimateSeason = 'summer' | 'winter'
export type PriorityType = 'mandatory' | 'normal' | 'comfort' | 'ac_grid'
export type LoadType = 'normal' | 'motor'
export type SwitchAction = 'on' | 'off'
export type Tier2Policy = 'crisp' | 'fuzzy_shadow' | 'fuzzy_active'
export type FuzzyBand = 'low' | 'watch' | 'high'
export type KBSActionStatus = 'pending' | 'scheduled' | 'applied' | 'blocked'
  | 'failed' | 'noop' | 'suppressed_duplicate' | 'superseded'
export type FuzzyCycleMode = 'active' | 'shadow' | 'fallback' | 'authoritative_bypass'
export type FuzzyActionStage = 'counterfactual' | 'received' | 'scheduled' | 'held_by_tier1' | 'applied' | 'suppressed' | 'failed' | 'no_op' | 'superseded'

export interface ClimateRow {
  city: string
  latitude_deg: number
  longitude_deg: number
  month: number
  season: ClimateSeason
  typical_weather: Exclude<WeatherCondition, 'storm' | 'foggy'>
  ghi_kwh_m2_day: number
  clearsky_ghi_kwh_m2_day: number
  cloud_amount_percent: number
  precip_mm_day: number
  temp_C: number
  humidity_percent: number
}
export interface ClimateResponse { cities: string[]; count: number; rows: ClimateRow[] }
export interface ConnectionSettings { backendUrl: string; tier1Url: string; organization: number }

export interface SiteInputs {
  localDateTime: string
  scale: number
  city: string
  weatherAuto: boolean
  manualWeather: WeatherCondition
  maxPvW: number
  pvThresholdW: number
  maxInverterW: number
  gridAvailable: boolean
  batteryCapacityWh: number
  batterySocPercent: number
  batteryNominalV: number
  batteryFloorV: number
  heatsinkC: number
}
export interface SimulatedBreaker {
  deviceId: string
  priorityType: PriorityType
  priorityDegree: number
  loadType: LoadType
  peakW: number
  normalW: number
  peakMinutes: number
  switchOn: boolean
  online: boolean
  fault: string
  onSinceMs: number | null
  countdownS: number
  lockedOut: boolean
  lockoutReason: string
}
export interface KBSSettings {
  cycle_seconds: number
  power_saving: boolean
  mode: 'observing' | 'active'
  data_source: 'real' | 'simulator'
  tier2_policy: Tier2Policy
  battery_low_voltage_V: number
  battery_low_margin_V: number
  battery_shutdown_buffer_percent: number
  joule_deficit_limit_J: number
  grid_present_min_V: number
  battery_capacity_Wh?: number
  heatsink_temp_limit_C?: number
  max_inverter_power_W?: number
  night_reserve_percent?: number
}
export interface SimulatorConfiguration {
  version: 2
  connections: ConnectionSettings
  site: SiteInputs
  breakers: SimulatedBreaker[]
  settings: KBSSettings
}
export interface SimulationCheckpoint {
  version: 2
  savedAt: string
  simMs: number
  batterySocWh: number
  heatsinkC: number
  weather: WeatherCondition
  breakers: SimulatedBreaker[]
}
export interface PowerFlow {
  pvW: number; clearSkyW: number; pvUsableW: number; loadW: number
  gridOn: boolean; gridSupplying: boolean; chargeW: number; dischargeW: number
  chargeCurrentA: number; dischargeCurrentA: number; socFrac: number
  batteryVoltageV: number; heatsinkC: number; gridVoltageV: number; empty: boolean
  sunriseH: number | null; sunsetH: number | null
}
export interface SensorOverrides {
  pvW?: number; heatsinkC?: number; batteryVoltageV?: number
  batteryChargeCurrentA?: number; batteryDischargeCurrentA?: number; gridVoltageV?: number
}
export interface PhysicalState {
  simMs: number; batterySocWh: number; heatsinkC: number; weather: WeatherCondition
  breakers: SimulatedBreaker[]; overrides: SensorOverrides
}

export interface TelemetryDTO {
  organization: number; timestamp: string; grid_voltage_V: number; grid_freq_Hz: number
  ac_output_voltage_V: number; ac_output_freq_Hz: number; ac_output_apparent_power_VA: number
  ac_output_active_power_W: number; output_load_percent: number; bus_voltage_V: number
  battery_voltage_V: number; battery_charge_current_A: number; battery_capacity_percent: number
  heatsink_temp_C: number; pv_input_current_A: number; pv_input_voltage_V: number
  battery_voltage_scc_V: number; battery_discharge_current_A: number
  device_status_flags: string; battery_voltage_offset_fans_on: number
  eeprom_version: string; pv_charging_power_W: number; device_status_flags2: string
}
export interface BreakerStatusDTO {
  device_id: string; timestamp: string; switch: boolean; countdown_1_s: number
  cur_current_mA: number; cur_power_mW: number; cur_voltage_mV: number
  fault: string; relay_status: 'last'; child_lock: boolean; cycle_time: string; online: boolean
}
export interface KBSAction {
  id: number; action_id: string; decision_event_id: string
  device_id: string; action: SwitchAction; countdown_s: number
  reason: string; branch: string; created_at: string; status: KBSActionStatus
  resulting_state: boolean | null
  executed_at: string | null
  failure_reason: string
}
export interface KBSAlert { kind: string; severity: 'info' | 'warning' | 'critical'; message: string; created_at: string }
export interface FuzzyRuleEvidence {
  rule_id: number
  if: { power_balance: string; battery_reserve: string; net_power_trend: string }
  then: FuzzyBand
  strength: number
}
export interface FuzzyEvaluation {
  profile_version: string
  valid: boolean
  fallback_reason: string | null
  inputs: Record<string, number>
  memberships: Record<string, Record<string, number>>
  fired_rules: FuzzyRuleEvidence[]
  aggregated_strengths: Partial<Record<FuzzyBand, number>>
  risk_score: number | null
  inferred_band: FuzzyBand | null
  risk_band?: FuzzyBand | null
  controller?: {
    previous_band?: FuzzyBand
    current_band?: FuzzyBand
    candidate_band?: FuzzyBand | null
    consecutive_cycles?: number
    transition?: string
    stale_reset?: boolean
    profile_reset?: boolean
    advanced?: boolean
  }
}
export interface CounterfactualDecision {
  policy?: Tier2Policy | 'crisp'
  branch?: string | null
  actions?: Array<Partial<KBSAction> & Pick<KBSAction, 'device_id' | 'action' | 'reason' | 'countdown_s'>>
  alerts?: Array<Pick<KBSAlert, 'kind' | 'severity' | 'message'>>
  fallback_reason?: string
}
export interface KBSControllerState {
  current_band: FuzzyBand
  candidate_band: FuzzyBand | null
  consecutive_cycles: number
  last_risk_score: number | null
  last_evaluated_at: string | null
  profile_version: string
}
export type Tier2DecisionEngine =
  | 'apps.kbs.services.run_cycle'
  | 'apps.kbs.engine.rules.decide'
  | 'legacy.apps.kbs.services.run_cycle'
export interface KBSDecision {
  engine: Tier2DecisionEngine; branch: string | null; created_at?: string
  policy?: Tier2Policy
  event_id?: string; tier?: 'tier2'; trace_version?: number; legacy?: boolean
  occurred_at?: string; received_at?: string
  trace?: Array<{
    code: string; kind: string; outcome: string; summary: string
    evidence: Record<string, unknown>
  }>
  facts: Record<string, unknown> | null; actions?: KBSAction[]; detail?: string
  fuzzy_evaluation?: FuzzyEvaluation
  counterfactual?: CounterfactualDecision
}
export interface KBSStateDTO {
  organization?: { id: number; name: string; latitude: number; longitude: number }
  settings: KBSSettings
  latest_decision: KBSDecision | null
  pending_actions: KBSAction[]
  recent_alerts: KBSAlert[]
  latest_telemetry?: Partial<TelemetryDTO> | null
  breakers?: Array<{ device_id: string; priority_type: PriorityType; priority_degree: number; load_type: LoadType; switch: boolean | null; countdown_1_s: number; online: boolean | null; child_lock: boolean; locked_out: boolean; lockout_reason: string }>
  metadata?: { engine: string; data_source: string; generated_at: string; policy?: Tier2Policy; fuzzy_profile?: string }
  policy?: Tier2Policy
  fuzzy_evaluation?: FuzzyEvaluation
  counterfactual?: CounterfactualDecision
  controller_state?: KBSControllerState
}
export interface Tier1Command { device_id: string; action: SwitchAction; countdown_s: number; reason: string }
export interface Tier1Result {
  engine: 'edge.tier1_kbs.evaluate'; situation: string; commands: Tier1Command[]
  notify: string; facts: Record<string, unknown>
}
export interface Countdown {
  key: string; source: 'T1' | 'T2'; deviceId: string
  fireAtSimMs: number; reason: string; decisionId?: string; action?: KBSAction
}
export type EvidenceTier = 'T1' | 'T2' | 'EXEC'
export interface EvidenceEvent {
  id: string; timestamp: string; tier: EvidenceTier
  kind: 'FACT' | 'RULE' | 'COMMAND' | 'ACK' | 'ALERT' | 'ERROR' | 'INFO'
  message: string; raw?: unknown
}
export interface TierRuntimeState {
  enabled: boolean; connected: boolean; status: string; engine: string | null
  situation?: string; branch?: string | null
  policy?: Tier2Policy
  fuzzyEvaluation?: FuzzyEvaluation | null
  counterfactual?: CounterfactualDecision | null
  controllerState?: KBSControllerState | null
  latestFuzzyCycle?: FuzzyDecisionCycle | null
}
export interface DashboardSnapshot {
  simMs: number; running: boolean; organization: string
  climate: ClimateRow | null; climateError: string | null
  weather: WeatherCondition; weatherMode: 'CSV AUTO' | 'MANUAL'; availableWeather: WeatherCondition[]
  flow: PowerFlow | null; breakers: SimulatedBreaker[]; pvHistory: number[]
  evidence: EvidenceEvent[]; alerts: KBSAlert[]; countdowns: Countdown[]
  tier1: TierRuntimeState; tier2: TierRuntimeState
  backendWeatherCondition: string | null; lastBranch: string | null
}

export interface ScenarioSetup extends Partial<SiteInputs> {
  localDateTime: string; tier1: boolean; tier2: boolean; pushIntervalS: number
  tier2CycleS: number; powerSaving: boolean
  tier2Policy?: Tier2Policy
  breakers: Array<Partial<SimulatedBreaker> & Pick<SimulatedBreaker, 'deviceId'>>
  overrides?: SensorOverrides; backendOffline?: boolean
}
export interface ScenarioEvent {
  atSimS: number; phase: string; label: string
  changes: { overrides?: SensorOverrides; state?: Partial<Pick<SiteInputs, 'gridAvailable'>>; breakers?: Record<string, Partial<SimulatedBreaker>>; backend?: 'online' | 'offline' }
}
export type ScenarioExpectation =
  | { type: 'tier1_idle'; label: string }
  | { type: 'tier1_situation'; value: string; label: string }
  | { type: 'tier1_action'; action: SwitchAction; devices: string[]; countdown?: 'zero' | 'positive'; label: string }
  | { type: 'tier1_action_absent'; deviceId: string; action: SwitchAction; label: string }
  | { type: 'tier2_branch'; values: string[]; label: string }
  | { type: 'tier2_action'; deviceId: string; action: SwitchAction; stage: 'received' | 'applied' | 'blocked'; countdown?: 'positive'; label: string }
  | { type: 'tier2_action_absent'; deviceId: string; action: SwitchAction; label: string }
  | { type: 'tier2_alert'; kind?: string; kinds?: string[]; label: string }
  | { type: 'fuzzy_band'; values: FuzzyBand[]; label: string }
  | { type: 'fuzzy_fallback'; value: string; label: string }
  | { type: 'counterfactual_branch'; values: string[]; label: string }
  | { type: 'band_transition'; values: string[]; label: string }
  | {
    type: 'fuzzy_cycle'; cycle: number; label: string
    totalCycles?: number
    mode?: FuzzyCycleMode
    valid?: boolean
    fallbackReason?: string | null
    inputs?: Partial<Record<string, NumericRange>>
    memberships?: Partial<Record<string, Partial<Record<string, NumericRange>>>>
    membershipsEmpty?: boolean
    rulesEmpty?: boolean
    ruleIds?: { match: 'exact' | 'subset'; values: number[] }
    aggregation?: Partial<Record<FuzzyBand, NumericRange>>
    riskScore?: NumericRange
    inferredBand?: FuzzyBand | null
    controllerBand?: FuzzyBand | null
    transition?: string
    fuzzyBranch?: string | null
    executedBranch?: string | null
    action?: FuzzyCycleActionExpectation
  }
  | {
    type: 'scenario_metric'; metric: keyof ScenarioMetrics
    range: NumericRange; label: string
  }
  | { type: 'backend_error'; label: string }
  | { type: 'breaker_state'; deviceId: string; switchOn: boolean; label: string }
export interface ScenarioDefinition {
  id: string; name: string; tier: 'Tier-1' | 'Tier-2' | 'Integrated'; description: string
  durationRealS: number; dateLocked?: boolean; timeLocked?: boolean
  batteryControl?: { source: 'event' | 'current'; eventIndex?: number; label: string; eventLabel?: string; min: number; max: number; step: number; note: string }
  setup: ScenarioSetup; events: ScenarioEvent[]; expectations: ScenarioExpectation[]
}
export interface ScenarioObservations {
  tier1Evaluations: number; tier1Situations: string[]; tier1Commands: Tier1Command[]
  tier2Branches: string[]; tier2ActionsReceived: KBSAction[]; tier2ActionsApplied: KBSAction[]
  tier2ActionsBlocked: KBSAction[]; tier2Alerts: KBSAlert[]; backendErrors: string[]
  fuzzyBands: FuzzyBand[]; fuzzyFallbackReasons: string[]
  counterfactualBranches: string[]; bandTransitions: string[]
  fuzzyCycles: FuzzyDecisionCycle[]
}
export interface ScenarioMetrics {
  gridImportWh: number
  minimumBatterySocPercent: number
  timeBelowReserveS: number
  optionalLoadServedWh: number
  mandatoryOffCommands: number
  actionCount: number
  commandReversals: number
}
export interface ScenarioRunSummary {
  policy: Tier2Policy
  metrics: ScenarioMetrics
  results: Array<'pending' | 'pass' | 'fail'>
}
export interface ScenarioComparison {
  status: 'idle' | 'running_crisp' | 'running_fuzzy' | 'complete' | 'error'
  scenarioId: string | null
  crisp: ScenarioRunSummary | null
  fuzzy: ScenarioRunSummary | null
  differences: ScenarioMetrics | null
  error: string | null
}
export interface ScenarioRuntime {
  selectedId: string; loadedId: string | null; active: boolean; completed: boolean
  phase: string; elapsedRealS: number; nextEventIndex: number
  startedRealMs: number; startedSimMs: number; overrides: SensorOverrides
  observations: ScenarioObservations; results: Array<'pending' | 'pass' | 'fail'>
  metrics: ScenarioMetrics
  lastCommands: Record<string, SwitchAction>
  log: Array<{ timestamp: string; message: string }>
}
export interface FuzzyCycleAction {
  id?: number
  action_id?: string
  decision_event_id?: string
  device_id: string
  action: SwitchAction
  countdown_s: number
  reason: string
  branch: string
  status?: KBSActionStatus
  resulting_state?: boolean | null
  executed_at?: string | null
  failure_reason?: string
  stage: FuzzyActionStage
  stageHistory: FuzzyActionStage[]
}
export interface FuzzyDecisionCycle {
  decisionId: string
  time: string
  policy: Tier2Policy
  mode: FuzzyCycleMode
  evaluation: FuzzyEvaluation
  fuzzyBranch: string | null
  fuzzyActions: FuzzyCycleAction[]
  executedBranch: string | null
  executedActions: FuzzyCycleAction[]
  counterfactualPolicy: Tier2Policy | 'crisp' | null
  counterfactualBranch: string | null
  counterfactualActions: FuzzyCycleAction[]
}
export interface NumericRange { min: number; max: number }
export interface FuzzyCycleActionExpectation {
  path: 'fuzzy' | 'executed' | 'counterfactual'
  deviceId?: string
  action?: SwitchAction
  stage: FuzzyActionStage
  stageMatch?: 'final' | 'visited'
}
