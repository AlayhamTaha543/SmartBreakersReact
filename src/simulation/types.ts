export type WeatherCondition = 'sunny' | 'partly_cloudy' | 'cloudy' | 'rainy' | 'storm' | 'foggy'
export type ClimateSeason = 'summer' | 'winter'
export type PriorityType = 'mandatory' | 'normal' | 'comfort' | 'ac_grid'
export type LoadType = 'normal' | 'motor'
export type SwitchAction = 'on' | 'off'

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
  battery_low_voltage_V: number
  battery_low_margin_V: number
  battery_shutdown_buffer_percent: number
  joule_deficit_limit_J: number
  grid_present_min_V: number
  battery_capacity_Wh?: number
  heatsink_temp_limit_C?: number
  max_inverter_power_W?: number
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
  id: number; device_id: string; action: SwitchAction; countdown_s: number
  reason: string; branch: string; created_at: string
}
export interface KBSAlert { kind: string; severity: 'info' | 'warning' | 'critical'; message: string; created_at: string }
export interface KBSDecision {
  engine: 'apps.kbs.services.run_cycle'; branch: string | null; created_at?: string
  facts: Record<string, unknown> | null; actions?: KBSAction[]; detail?: string
}
export interface KBSStateDTO {
  organization?: { id: number; name: string; latitude: number; longitude: number }
  settings: KBSSettings
  latest_decision: Omit<KBSDecision, 'actions'> | null
  pending_actions: KBSAction[]
  recent_alerts: KBSAlert[]
  latest_telemetry?: Partial<TelemetryDTO> | null
  breakers?: Array<{ device_id: string; priority_type: PriorityType; priority_degree: number; load_type: LoadType; switch: boolean | null; countdown_1_s: number; online: boolean | null; child_lock: boolean; locked_out: boolean; lockout_reason: string }>
  metadata?: { engine: string; data_source: string; generated_at: string }
}
export interface Tier1Command { device_id: string; action: SwitchAction; countdown_s: number; reason: string }
export interface Tier1Result {
  engine: 'edge.tier1_kbs.evaluate'; situation: string; commands: Tier1Command[]
  notify: string; facts: Record<string, unknown>
}
export interface Countdown {
  key: string; actionId?: number; source: 'T1' | 'T2'; deviceId: string
  fireAtSimMs: number; reason: string
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
}
export interface ScenarioRuntime {
  selectedId: string; loadedId: string | null; active: boolean; completed: boolean
  phase: string; elapsedRealS: number; nextEventIndex: number
  startedRealMs: number; startedSimMs: number; overrides: SensorOverrides
  observations: ScenarioObservations; results: Array<'pending' | 'pass' | 'fail'>
  log: Array<{ timestamp: string; message: string }>
}
