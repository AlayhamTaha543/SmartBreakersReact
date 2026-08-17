import type { ScenarioMetrics, ScenarioObservations, SimulatorConfiguration, SimulatedBreaker } from './types'

export const STORAGE_KEY = 'smartbreaker:simulator:v2'
export const CHECKPOINT_KEY = 'smartbreaker:checkpoint:v2'

const environmentUrl = (value: string | undefined, fallback: string) => value?.trim() || fallback
const environmentOrganization = Number(import.meta.env.VITE_SMARTBREAKER_ORGANIZATION)

export const defaultBreakers: SimulatedBreaker[] = [
  { deviceId: 'sim-servers', priorityType: 'mandatory', priorityDegree: 5, loadType: 'normal', peakW: 300, normalW: 300, peakMinutes: 15, switchOn: true, online: true, fault: '', onSinceMs: null, countdownS: 0, lockedOut: false, lockoutReason: '' },
  { deviceId: 'sim-fridge', priorityType: 'normal', priorityDegree: 3, loadType: 'motor', peakW: 600, normalW: 150, peakMinutes: 15, switchOn: true, online: true, fault: '', onSinceMs: null, countdownS: 0, lockedOut: false, lockoutReason: '' },
  { deviceId: 'sim-ac-unit', priorityType: 'comfort', priorityDegree: 2, loadType: 'motor', peakW: 1800, normalW: 900, peakMinutes: 15, switchOn: false, online: true, fault: '', onSinceMs: null, countdownS: 0, lockedOut: false, lockoutReason: '' },
  { deviceId: 'sim-event-load', priorityType: 'normal', priorityDegree: 8, loadType: 'normal', peakW: 700, normalW: 700, peakMinutes: 15, switchOn: false, online: true, fault: '', onSinceMs: null, countdownS: 0, lockedOut: false, lockoutReason: '' },
  { deviceId: 'sim-grid', priorityType: 'ac_grid', priorityDegree: 1, loadType: 'normal', peakW: 0, normalW: 0, peakMinutes: 0, switchOn: false, online: true, fault: '', onSinceMs: null, countdownS: 0, lockedOut: false, lockoutReason: '' },
]

export const defaultConfiguration: SimulatorConfiguration = {
  version: 2,
  connections: {
    backendUrl: environmentUrl(import.meta.env.VITE_SMARTBREAKER_BACKEND_URL, 'http://127.0.0.1:8000'),
    tier1Url: environmentUrl(import.meta.env.VITE_SMARTBREAKER_TIER1_URL, 'http://127.0.0.1:8788'),
    organization: Number.isSafeInteger(environmentOrganization) && environmentOrganization > 0 ? environmentOrganization : 1,
  },
  site: {
    localDateTime: '2026-07-15T12:00:00', scale: 60, city: 'Damascus',
    weatherAuto: true, manualWeather: 'sunny', maxPvW: 4000, pvThresholdW: 80,
    maxInverterW: 4000, gridAvailable: true, batteryCapacityWh: 5000,
    batterySocPercent: 60, batteryNominalV: 24, batteryFloorV: 24, heatsinkC: 25,
  },
  breakers: structuredClone(defaultBreakers),
  settings: {
    cycle_seconds: 5, power_saving: false, mode: 'active', data_source: 'simulator',
    tier2_policy: 'crisp',
    battery_low_voltage_V: 24, battery_low_margin_V: 0.5,
    battery_shutdown_buffer_percent: 2, joule_deficit_limit_J: 10_800_000,
    grid_present_min_V: 100, night_reserve_percent: 30,
  },
}

export const cloneConfiguration = (value: SimulatorConfiguration): SimulatorConfiguration => structuredClone(value)
export const freshObservations = (): ScenarioObservations => ({
  tier1Evaluations: 0, tier1Situations: [], tier1Commands: [], tier2Branches: [],
  tier2ActionsReceived: [], tier2ActionsApplied: [], tier2ActionsBlocked: [],
  tier2Alerts: [], backendErrors: [], fuzzyBands: [], fuzzyFallbackReasons: [],
  counterfactualBranches: [], bandTransitions: [], fuzzyCycles: [],
})
export const freshMetrics = (): ScenarioMetrics => ({
  gridImportWh: 0,
  minimumBatterySocPercent: 100,
  timeBelowReserveS: 0,
  optionalLoadServedWh: 0,
  mandatoryOffCommands: 0,
  actionCount: 0,
  commandReversals: 0,
})

export function loadStoredConfiguration(): SimulatorConfiguration {
  if (typeof window === 'undefined') return cloneConfiguration(defaultConfiguration)
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<SimulatorConfiguration> | null
    if (value?.version !== 2 || !value.site || !value.connections || !Array.isArray(value.breakers)) {
      return cloneConfiguration(defaultConfiguration)
    }
    const defaults = cloneConfiguration(defaultConfiguration)
    return {
      ...defaults,
      ...value,
      connections: { ...defaults.connections, ...value.connections },
      site: { ...defaults.site, ...value.site },
      settings: { ...defaults.settings, ...value.settings },
      breakers: value.breakers as SimulatedBreaker[],
    } as SimulatorConfiguration
  } catch {
    return cloneConfiguration(defaultConfiguration)
  }
}

export function saveStoredConfiguration(value: SimulatorConfiguration) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}
