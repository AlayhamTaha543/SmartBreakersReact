import { defaultBreakers } from './defaults'
import type { ScenarioDefinition, SimulatedBreaker } from './types'

const scenarioBaseBreakers: SimulatedBreaker[] = [
  { ...defaultBreakers[0], loadType: 'normal', peakW: 300, normalW: 300, switchOn: true },
  { ...defaultBreakers[1], loadType: 'normal', peakW: 400, normalW: 400, switchOn: true },
  { ...defaultBreakers[2], loadType: 'normal', peakW: 500, normalW: 500, switchOn: false },
  { ...defaultBreakers[3], loadType: 'normal', peakW: 700, normalW: 700, switchOn: false },
  { ...defaultBreakers[4], loadType: 'normal', peakW: 0, normalW: 0, switchOn: false },
]

function breakers(overrides: Record<string, Partial<SimulatedBreaker>> = {}) {
  return scenarioBaseBreakers.map((breaker) => ({ ...structuredClone(breaker), ...(overrides[breaker.deviceId] ?? {}) }))
}
const base = {
  localDateTime: '2026-07-15T12:00:00', scale: 60, manualWeather: 'sunny' as const,
  weatherAuto: false, maxPvW: 4000, pvThresholdW: 80, maxInverterW: 4000,
  gridAvailable: true, batteryCapacityWh: 5000, batterySocPercent: 80,
  batteryNominalV: 24, batteryFloorV: 24, heatsinkC: 40,
  pushIntervalS: 1, tier2CycleS: 5, powerSaving: false,
  tier2Policy: 'crisp' as const, breakers: breakers(),
}

export const scenarios: ScenarioDefinition[] = [
  {
    id: 't1-normal', name: 'T1 · normal operation', tier: 'Tier-1', durationRealS: 5,
    description: 'Healthy inverter, battery and grid. Tier-1 must remain idle.',
    setup: { ...base, tier1: true, tier2: false }, events: [],
    expectations: [{ type: 'tier1_idle', label: 'Tier-1 evaluates but emits no safety situation' }],
  },
  {
    id: 't1-overheat', name: 'T1 · inverter overheat', tier: 'Tier-1', durationRealS: 9,
    description: 'Starts healthy, then injects an 80 °C heatsink and verifies local safety shedding.',
    setup: { ...base, tier1: true, tier2: false, breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 1000, heatsinkC: 40, batteryVoltageV: 26 } },
    events: [{ atSimS: 180, phase: 'DURING OVERHEAT', label: 'Heatsink rises from 40 °C to 80 °C', changes: { overrides: { heatsinkC: 80 } } }],
    expectations: [
      { type: 'tier1_situation', value: 'inverter_overheat', label: 'Tier-1 detects inverter_overheat' },
      { type: 'tier1_action', action: 'off', devices: ['sim-ac-unit', 'sim-fridge'], label: 'Comfort and normal loads receive immediate OFF commands' },
      { type: 'tier1_action_absent', deviceId: 'sim-servers', action: 'off', label: 'Mandatory server never receives OFF' },
    ],
  },
  {
    id: 't1-overload', name: 'T1 · mild overload', tier: 'Tier-1', durationRealS: 6,
    description: 'A 1200 W load on a 1000 W inverter should shed only the 500 W comfort load.',
    setup: { ...base, tier1: true, tier2: false, maxInverterW: 1000, breakers: breakers(), overrides: { pvW: 500, heatsinkC: 40, batteryVoltageV: 26 } },
    events: [{ atSimS: 180, phase: 'DURING OVERLOAD', label: '500 W comfort load switches ON and pushes total load to 1200 W', changes: { breakers: { 'sim-ac-unit': { switchOn: true } } } }],
    expectations: [
      { type: 'tier1_situation', value: 'inverter_overload', label: 'Tier-1 detects inverter_overload' },
      { type: 'tier1_action', action: 'off', devices: ['sim-ac-unit'], label: 'Least-important comfort load is shed' },
      { type: 'tier1_action_absent', deviceId: 'sim-fridge', action: 'off', label: 'Normal load survives the mild overload' },
    ],
  },
  {
    id: 't1-battery-critical', name: 'T1 · battery critical', tier: 'Tier-1', durationRealS: 6,
    description: 'Battery at the voltage floor must shed non-mandatory loads immediately.',
    batteryControl: { source: 'event', eventIndex: 0, label: 'Critical-event battery voltage (V)', eventLabel: 'Battery voltage changes to tester target', min: 20, max: 30, step: .01, note: 'Choose the voltage injected when the critical event begins.' },
    setup: { ...base, tier1: true, tier2: false, breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 0, heatsinkC: 40, batteryVoltageV: 26, batteryChargeCurrentA: 0, batteryDischargeCurrentA: 49 } },
    events: [{ atSimS: 180, phase: 'BATTERY CRITICAL', label: 'Battery voltage collapses from 26 V to 24.05 V', changes: { overrides: { batteryVoltageV: 24.05 } } }],
    expectations: [
      { type: 'tier1_situation', value: 'battery_critical', label: 'Tier-1 detects battery_critical' },
      { type: 'tier1_action', action: 'off', devices: ['sim-ac-unit', 'sim-fridge'], countdown: 'zero', label: 'Shutdown commands are immediate' },
    ],
  },
  {
    id: 't1-battery-countdown', name: 'T1 · low-battery countdown', tier: 'Tier-1', durationRealS: 7,
    description: 'Battery near its floor should arm delayed OFF commands rather than cutting instantly.',
    batteryControl: { source: 'event', eventIndex: 0, label: 'Low-battery event voltage (V)', eventLabel: 'Battery voltage changes to tester target', min: 20, max: 30, step: .01, note: 'Choose a value near the configured floor.' },
    setup: { ...base, tier1: true, tier2: false, breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 0, heatsinkC: 40, batteryVoltageV: 26, batteryChargeCurrentA: 0, batteryDischargeCurrentA: 49 } },
    events: [{ atSimS: 180, phase: 'BATTERY LOW', label: 'Battery voltage falls from 26 V to 24.4 V', changes: { overrides: { batteryVoltageV: 24.4 } } }],
    expectations: [
      { type: 'tier1_situation', value: 'battery_low', label: 'Tier-1 detects battery_low' },
      { type: 'tier1_action', action: 'off', devices: ['sim-ac-unit', 'sim-fridge'], countdown: 'positive', label: 'Loads receive positive countdowns' },
    ],
  },
  {
    id: 't1-grid-outage', name: 'T1 · grid outage with thin battery', tier: 'Tier-1', durationRealS: 6,
    description: 'A dead grid with the grid breaker closed and a thin battery must trigger local shedding.',
    batteryControl: { source: 'current', label: 'Battery voltage during outage (V)', min: 20, max: 30, step: .01, note: 'This live value determines whether the bank is thin.' },
    setup: { ...base, tier1: true, tier2: false, gridAvailable: true, breakers: breakers({ 'sim-ac-unit': { switchOn: true }, 'sim-grid': { switchOn: true } }), overrides: { pvW: 0, heatsinkC: 40, batteryVoltageV: 24.9, batteryChargeCurrentA: 0, batteryDischargeCurrentA: 49, gridVoltageV: 230 } },
    events: [{ atSimS: 180, phase: 'GRID OUTAGE', label: 'State-grid input drops from 230 V to 0 V', changes: { state: { gridAvailable: false }, overrides: { gridVoltageV: 0 } } }],
    expectations: [
      { type: 'tier1_situation', value: 'grid_outage', label: 'Tier-1 detects grid_outage' },
      { type: 'tier1_action_absent', deviceId: 'sim-grid', action: 'off', label: 'Grid breaker stays ON for automatic recovery' },
    ],
  },
  {
    id: 't2-day-surplus', name: 'T2 · daytime solar surplus', tier: 'Tier-2', durationRealS: 13,
    description: 'Strong PV should run the scheduled comfort load without buying grid electricity.',
    setup: { ...base, tier1: false, tier2: true, overrides: { pvW: 3000, heatsinkC: 40, batteryVoltageV: 26.5 } }, events: [],
    expectations: [
      { type: 'tier2_branch', values: ['day.surplus.comfort_on'], label: 'Tier-2 takes the daytime surplus branch' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'on', stage: 'applied', label: 'Scheduled comfort load is switched ON' },
    ],
  },
  {
    id: 't2-day-deficit-grid', name: 'T2 · daytime deficit buys grid', tier: 'Tier-2', durationRealS: 13,
    description: 'Weak PV and an unstable battery should close the AC-grid breaker.',
    setup: { ...base, tier1: false, tier2: true, batterySocPercent: 30, overrides: { pvW: 100, heatsinkC: 40, batteryVoltageV: 25.5 } }, events: [],
    expectations: [
      { type: 'tier2_branch', values: ['day.deficit.buy_grid'], label: 'Tier-2 takes the deficit/grid branch' },
      { type: 'tier2_action', deviceId: 'sim-grid', action: 'on', stage: 'applied', label: 'Grid breaker is switched ON' },
    ],
  },
  {
    id: 't2-power-saving', name: 'T2 · power-saving subset', tier: 'Tier-2', durationRealS: 13,
    description: 'With limited PV, keep the normal load and shed the less-important comfort load.',
    setup: { ...base, tier1: false, tier2: true, powerSaving: true, batterySocPercent: 30, breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 800, heatsinkC: 40, batteryVoltageV: 25.5 } }, events: [],
    expectations: [
      { type: 'tier2_branch', values: ['day.deficit.power_saving'], label: 'Tier-2 takes the power-saving branch' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'off', stage: 'applied', label: 'Comfort load is shed' },
      { type: 'tier2_action_absent', deviceId: 'sim-fridge', action: 'off', label: 'Higher-priority fridge is kept running' },
    ],
  },
  {
    id: 't2-summer-pv-drop', name: 'T2 · sudden PV drop with seasonal diagnosis', tier: 'Tier-2', durationRealS: 14,
    description: 'Build a 3000 W baseline, then collapse PV to 300 W. Python derives the season.',
    setup: { ...base, tier1: false, tier2: true, overrides: { pvW: 3000, heatsinkC: 40, batteryVoltageV: 26.5 } },
    events: [{ atSimS: 180, phase: 'DURING PV DROP', label: 'PV production suddenly falls from 3000 W to 300 W', changes: { overrides: { pvW: 300 } } }],
    expectations: [
      { type: 'tier2_branch', values: ['day.sudden_drop.battery_ok'], label: 'Tier-2 detects the sudden drop while battery is stable' },
      { type: 'tier2_alert', kinds: ['panel_fault', 'weather_drop'], label: 'Engine raises its season-appropriate PV-drop alert' },
    ],
  },
  {
    id: 't2-battery-protection', name: 'T2 · battery protection', tier: 'Tier-2', durationRealS: 13,
    description: 'Low battery voltage should schedule shutdown countdowns and switch the grid on.',
    batteryControl: { source: 'current', label: 'Battery protection test voltage (V)', min: 20, max: 30, step: .01, note: 'This is the live voltage sent to Tier-2.' },
    setup: { ...base, tier1: false, tier2: true, tier2Policy: 'fuzzy_active', breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 0, heatsinkC: 40, batteryVoltageV: 24.4, batteryChargeCurrentA: 0, batteryDischargeCurrentA: 49 } }, events: [],
    expectations: [
      { type: 'tier2_branch', values: ['protect_battery'], label: 'Tier-2 takes protect_battery' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'off', countdown: 'positive', stage: 'received', label: 'Comfort load receives a countdown shutdown' },
      { type: 'tier2_action', deviceId: 'sim-grid', action: 'on', stage: 'applied', label: 'Grid takes over immediately' },
      { type: 'fuzzy_fallback', value: 'hard_protection_authoritative', label: 'Hard battery protection bypasses fuzzy normal control' },
      {
        type: 'fuzzy_cycle', cycle: 1, mode: 'authoritative_bypass', valid: false,
        fallbackReason: 'hard_protection_authoritative', membershipsEmpty: true, rulesEmpty: true,
        executedBranch: 'protect_battery',
        action: { path: 'executed', deviceId: 'sim-grid', action: 'on', stage: 'applied' },
        label: 'Cycle 1 records the authoritative bypass before the applied protection action',
      },
    ],
  },
  {
    id: 't2-night-trip', name: 'T2 · night sudden-draw trip', tier: 'Tier-2', durationRealS: 14,
    description: 'At night, introduce a large comfort load that endangers the mandatory morning reserve.',
    setup: { ...base, localDateTime: '2026-07-15T23:00:00', tier1: false, tier2: true, powerSaving: true, batterySocPercent: 20, overrides: { pvW: 0, heatsinkC: 35, batteryVoltageV: 25.2 } },
    events: [{ atSimS: 180, phase: 'DURING SUDDEN DRAW', label: 'A 2000 W comfort load is switched ON', changes: { breakers: { 'sim-ac-unit': { switchOn: true, peakW: 2000, normalW: 2000 } } } }],
    expectations: [
      { type: 'tier2_branch', values: ['night.sudden_draw.trip'], label: 'Tier-2 takes the night trip branch' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'off', stage: 'applied', label: 'Sudden-draw culprit is switched OFF' },
      { type: 'tier2_alert', kind: 'night_trip', label: 'User receives a night_trip alert' },
    ],
  },
  {
    id: 't2-grid-outage', name: 'T2 · state-grid outage fallback', tier: 'Tier-2', durationRealS: 13,
    description: 'Grid breaker is closed but voltage is absent; Tier-2 must shed while leaving it closed.',
    setup: { ...base, tier1: false, tier2: true, gridAvailable: false, batterySocPercent: 30, breakers: breakers({ 'sim-ac-unit': { switchOn: true }, 'sim-grid': { switchOn: true } }), overrides: { pvW: 100, heatsinkC: 40, batteryVoltageV: 25.5, gridVoltageV: 0 } }, events: [],
    expectations: [
      { type: 'tier2_branch', values: ['day.deficit.grid_out.shed'], label: 'Tier-2 takes the grid-out shedding branch' },
      { type: 'tier2_alert', kind: 'grid_outage', label: 'Critical grid_outage alert is raised' },
    ],
  },
  {
    id: 't2-scheduled-event', name: 'T2 · scheduled event requirement', tier: 'Tier-2', durationRealS: 13, dateLocked: true, timeLocked: true,
    description: 'During the seeded event, its normally-OFF event breaker is mandatory and switched ON.',
    setup: { ...base, localDateTime: '2026-08-15T12:00:00', tier1: false, tier2: true, overrides: { pvW: 3000, heatsinkC: 40, batteryVoltageV: 26.5 } }, events: [],
    expectations: [{ type: 'tier2_action', deviceId: 'sim-event-load', action: 'on', stage: 'applied', label: 'Event-required breaker is switched ON' }],
  },
  {
    id: 'combined-precedence', name: 'T1 + T2 · safety precedence', tier: 'Integrated', durationRealS: 14,
    description: 'Tier-1 sheds an overheated site; fuzzy low-risk restoration is held locally, then applied only after the danger clears.',
    setup: { ...base, tier1: true, tier2: true, tier2Policy: 'fuzzy_active', batteryCapacityWh: 20_000, breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 3000, heatsinkC: 40, batteryVoltageV: 26.5 } },
    events: [
      { atSimS: 180, phase: 'DURING OVERHEAT', label: 'Heatsink rises from 40 °C to 80 °C', changes: { overrides: { heatsinkC: 80 } } },
      { atSimS: 480, phase: 'DANGER CLEARS', label: 'Heatsink returns to a safe 40 °C', changes: { overrides: { heatsinkC: 40 } } },
    ],
    expectations: [
      { type: 'tier1_situation', value: 'inverter_overheat', label: 'Tier-1 detects and handles the overheat first' },
      { type: 'tier1_action', action: 'off', devices: ['sim-ac-unit'], label: 'Tier-1 switches the comfort load OFF' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'on', stage: 'blocked', label: 'Tier-2 restoration is blocked during danger' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'on', stage: 'applied', label: 'Held Tier-2 restoration applies after danger clears' },
      { type: 'fuzzy_band', values: ['low'], label: 'Normal Tier-2 restores comfort through its low-risk branch' },
      {
        type: 'fuzzy_cycle', cycle: 1, valid: true, controllerBand: 'low',
        ruleIds: { match: 'subset', values: [27] },
        fuzzyBranch: 'fuzzy.low.day.comfort_on', executedBranch: 'fuzzy.low.day.comfort_on',
        action: { path: 'executed', deviceId: 'sim-ac-unit', action: 'on', stage: 'held_by_tier1', stageMatch: 'visited' },
        label: 'Cycle 1 records the fuzzy action being held by Tier-1',
      },
      {
        type: 'fuzzy_cycle', cycle: 1,
        action: { path: 'executed', deviceId: 'sim-ac-unit', action: 'on', stage: 'applied' },
        label: 'The same cycle action reaches applied only after Tier-1 clears',
      },
    ],
  },
  {
    id: 'combined-backend-outage', name: 'T1 + T2 · backend unavailable', tier: 'Integrated', durationRealS: 8,
    description: 'Route Tier-2 to an unavailable local port and verify Tier-1 protection still works.',
    setup: { ...base, tier1: true, tier2: true, backendOffline: true, breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 1000, heatsinkC: 40, batteryVoltageV: 26 } },
    events: [{ atSimS: 120, phase: 'BACKEND OFFLINE · OVERHEAT', label: 'Heatsink rises to 80 °C while Tier-2 is unreachable', changes: { overrides: { heatsinkC: 80 } } }],
    expectations: [
      { type: 'backend_error', label: 'The simulator observes a Tier-2/backend connection error' },
      { type: 'tier1_situation', value: 'inverter_overheat', label: 'Tier-1 still detects inverter_overheat' },
      { type: 'tier1_action', action: 'off', devices: ['sim-ac-unit', 'sim-fridge'], label: 'Local safety shedding still executes' },
    ],
  },
  {
    id: 'combined-recovery', name: 'T1 + T2 · danger clears and control returns', tier: 'Integrated', durationRealS: 17,
    description: 'Keep heat high through one Tier-2 cycle, clear it, then verify normal restoration.',
    setup: { ...base, tier1: true, tier2: true, breakers: breakers({ 'sim-ac-unit': { switchOn: true } }), overrides: { pvW: 3000, heatsinkC: 40, batteryVoltageV: 26.5 } },
    events: [
      { atSimS: 180, phase: 'DURING OVERHEAT', label: 'Heatsink rises from 40 °C to 80 °C', changes: { overrides: { heatsinkC: 80 } } },
      { atSimS: 600, phase: 'RECOVERY', label: 'Heatsink returns to a safe 40 °C', changes: { overrides: { heatsinkC: 40 } } },
    ],
    expectations: [
      { type: 'tier1_situation', value: 'inverter_overheat', label: 'Tier-1 initially protects the site' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'on', stage: 'blocked', label: 'An early Tier-2 ON is blocked during danger' },
      { type: 'tier2_action', deviceId: 'sim-ac-unit', action: 'on', stage: 'applied', label: 'Tier-2 restores the load after danger clears' },
    ],
  },
  {
    id: 'real-damascus-evening-outage', name: 'REAL · Damascus evening utility failure', tier: 'Integrated', durationRealS: 13,
    description: 'A 4 kWp / 4 kW Damascus office or clinic with a 5 kWh battery loses utility power as solar production fades. Both tiers must preserve its mandatory IT and lighting circuit and leave the grid contactor ready for recovery.',
    setup: {
      ...base,
      localDateTime: '2026-07-15T18:00:00', city: 'Damascus',
      tier1: true, tier2: true, batterySocPercent: 27, heatsinkC: 38,
      breakers: breakers({
        'sim-servers': { loadType: 'normal', peakW: 700, normalW: 700, switchOn: true },
        'sim-fridge': { loadType: 'motor', peakW: 900, normalW: 300, peakMinutes: 1, switchOn: true },
        'sim-ac-unit': { loadType: 'motor', peakW: 1800, normalW: 900, peakMinutes: 1, switchOn: true },
        'sim-event-load': { loadType: 'motor', peakW: 1200, normalW: 750, peakMinutes: 2, switchOn: false },
        'sim-grid': { switchOn: true },
      }),
    },
    events: [{
      atSimS: 180, phase: 'UTILITY OUTAGE',
      label: 'The 230 V utility supply fails while the grid contactor remains closed',
      changes: { state: { gridAvailable: false } },
    }],
    expectations: [
      { type: 'tier1_situation', value: 'grid_outage', label: 'Tier-1 identifies a closed grid contactor with no utility voltage' },
      { type: 'tier1_action', action: 'off', devices: ['sim-ac-unit', 'sim-fridge'], label: 'Tier-1 sheds comfort and normal loads locally' },
      { type: 'tier1_action_absent', deviceId: 'sim-servers', action: 'off', label: 'The mandatory IT and lighting circuit remains powered' },
      { type: 'tier1_action_absent', deviceId: 'sim-grid', action: 'off', label: 'The grid contactor remains closed for automatic utility recovery' },
      { type: 'tier2_branch', values: ['tier1_interlock.grid_outage'], label: 'Tier-2 honors the active Tier-1 grid-outage interlock' },
      { type: 'breaker_state', deviceId: 'sim-ac-unit', switchOn: false, label: 'The comfort load remains shed at the end of the incident' },
      { type: 'breaker_state', deviceId: 'sim-grid', switchOn: true, label: 'The grid contactor remains ready for automatic recovery' },
    ],
  },
  {
    id: 'fuzzy-immediate-high', name: 'Fuzzy · immediate severe-risk entry', tier: 'Tier-2', durationRealS: 13,
    description: 'Build a safe charging baseline with a thin reserve, then apply a sharp but still charging PV decline. Risk at or above 75 enters high immediately.',
    setup: { ...base, tier1: false, tier2: true, tier2Policy: 'fuzzy_active', batterySocPercent: 10, overrides: { pvW: 3000, heatsinkC: 40 } },
    events: [{ atSimS: 360, phase: 'SEVERE FUZZY RISK', label: 'PV declines from 3000 W to 2100 W while battery reserve remains thin', changes: { overrides: { pvW: 2100 } } }],
    expectations: [
      { type: 'fuzzy_band', values: ['high'], label: 'Fuzzy controller enters the high band' },
      { type: 'band_transition', values: ['immediate_high_entry'], label: 'Severe score enters high without two-cycle delay' },
      { type: 'tier2_branch', values: ['fuzzy.high.buy_grid'], label: 'Active fuzzy high-risk policy requests grid takeover' },
      {
        type: 'fuzzy_cycle', cycle: 1, mode: 'active', valid: true,
        inputs: {
          power_balance_ratio: { min: .55, max: .6 },
          battery_reserve_margin: { min: -.95, max: -.85 },
          net_power_trend: { min: -.01, max: .01 },
        },
        ruleIds: { match: 'exact', values: [20] }, riskScore: { min: 49, max: 51 },
        inferredBand: 'watch', controllerBand: 'watch', fuzzyBranch: 'fuzzy.watch.preserve',
        executedBranch: 'fuzzy.watch.preserve',
        label: 'Cycle 1 fires rule 20 at a watch-band centroid',
      },
      {
        type: 'fuzzy_cycle', cycle: 2, mode: 'active', valid: true,
        ruleIds: { match: 'exact', values: [19, 20] }, riskScore: { min: 75, max: 85 },
        inferredBand: 'high', controllerBand: 'high', transition: 'immediate_high_entry',
        fuzzyBranch: 'fuzzy.high.buy_grid', executedBranch: 'fuzzy.high.buy_grid',
        action: { path: 'executed', deviceId: 'sim-grid', action: 'on', stage: 'applied' },
        label: 'Cycle 2 enters high immediately and applies grid takeover',
      },
    ],
  },
  {
    id: 'fuzzy-confirm-high', name: 'Fuzzy · two-cycle moderate-risk confirmation', tier: 'Tier-2', durationRealS: 12,
    description: 'A steady 100 W PV / 700 W load balance with SOC at the reserve target produces moderate high risk and requires two consecutive cycles.',
    setup: { ...base, tier1: false, tier2: true, tier2Policy: 'fuzzy_active', batteryCapacityWh: 20_000, batterySocPercent: 30, overrides: { pvW: 100, heatsinkC: 40 } },
    events: [],
    expectations: [
      { type: 'band_transition', values: ['confirming_high_entry'], label: 'First moderate-risk cycle records a high candidate' },
      { type: 'band_transition', values: ['confirmed_high_entry'], label: 'Second consecutive cycle confirms high' },
      { type: 'fuzzy_band', values: ['high'], label: 'Controller reaches high only after confirmation' },
      {
        type: 'fuzzy_cycle', cycle: 1, mode: 'active', valid: true,
        ruleIds: { match: 'exact', values: [2, 5, 11, 14] }, riskScore: { min: 65, max: 70 },
        inferredBand: 'high', controllerBand: 'watch', transition: 'confirming_high_entry',
        fuzzyBranch: 'fuzzy.watch.preserve', executedBranch: 'fuzzy.watch.preserve',
        label: 'Cycle 1 records moderate high evidence without an early command',
      },
      {
        type: 'fuzzy_cycle', cycle: 2, mode: 'active', valid: true,
        ruleIds: { match: 'exact', values: [2, 5, 11, 14] }, riskScore: { min: 65, max: 70 },
        inferredBand: 'high', controllerBand: 'high', transition: 'confirmed_high_entry',
        fuzzyBranch: 'fuzzy.high.buy_grid', executedBranch: 'fuzzy.high.buy_grid',
        action: { path: 'executed', deviceId: 'sim-grid', action: 'on', stage: 'applied' },
        label: 'Cycle 2 confirms high and applies grid takeover',
      },
    ],
  },
  {
    id: 'fuzzy-two-cycle-recovery', name: 'Fuzzy · two-cycle high-risk recovery', tier: 'Tier-2', durationRealS: 17,
    description: 'Start in immediate high risk, then restore PV and battery reserve. High is retained for one low-risk cycle and exits on the second.',
    setup: { ...base, tier1: false, tier2: true, tier2Policy: 'fuzzy_active', maxInverterW: 3000, batteryCapacityWh: 20_000, batterySocPercent: 20, overrides: { pvW: 0, heatsinkC: 40 } },
    events: [{ atSimS: 360, phase: 'FUZZY RECOVERY', label: 'PV rises to 3000 W and battery voltage recovers to 27 V', changes: { overrides: { pvW: 3000, batteryVoltageV: 27 } } }],
    expectations: [
      { type: 'band_transition', values: ['immediate_high_entry'], label: 'Initial severe condition enters high immediately' },
      { type: 'band_transition', values: ['confirming_high_exit'], label: 'First low-risk recovery cycle retains high' },
      { type: 'band_transition', values: ['confirmed_high_exit'], label: 'Second low-risk recovery cycle exits high' },
      { type: 'fuzzy_band', values: ['low'], label: 'Recovered controller reaches low' },
      {
        type: 'fuzzy_cycle', cycle: 1, mode: 'active', valid: true,
        ruleIds: { match: 'exact', values: [2, 11] }, riskScore: { min: 78, max: 85 },
        inferredBand: 'high', controllerBand: 'high', transition: 'immediate_high_entry',
        fuzzyBranch: 'fuzzy.high.buy_grid', executedBranch: 'fuzzy.high.buy_grid',
        label: 'Cycle 1 fires rules 2 and 11 and enters high immediately',
      },
      {
        type: 'fuzzy_cycle', cycle: 2, mode: 'active', valid: true,
        ruleIds: { match: 'exact', values: [27] }, riskScore: { min: 15, max: 20 },
        inferredBand: 'low', controllerBand: 'high', transition: 'confirming_high_exit',
        fuzzyBranch: 'fuzzy.high.buy_grid', executedBranch: 'fuzzy.high.buy_grid',
        label: 'Cycle 2 infers low while hysteresis retains high',
      },
      {
        type: 'fuzzy_cycle', cycle: 3, mode: 'active', valid: true,
        ruleIds: { match: 'exact', values: [26] }, riskScore: { min: 15, max: 20 },
        inferredBand: 'low', controllerBand: 'low', transition: 'confirmed_high_exit',
        fuzzyBranch: 'fuzzy.low.day.comfort_on', executedBranch: 'fuzzy.low.day.comfort_on',
        label: 'Cycle 3 fires rule 26 and completes low-risk recovery',
      },
    ],
  },
  {
    id: 'fuzzy-boundary-noise', name: 'Fuzzy · SOC and balance boundary noise', tier: 'Tier-2', durationRealS: 23,
    description: 'Establish rule 17 at 5 seconds, then inject falling, rising, and returning overlap noise between controller instants without command chatter.',
    setup: { ...base, tier1: false, tier2: true, tier2Policy: 'fuzzy_active', batteryCapacityWh: 20_000, batterySocPercent: 60, overrides: { pvW: 700, heatsinkC: 40, batteryVoltageV: 26.04 } },
    events: [
      { atSimS: 360, phase: 'FALLING OVERLAP', label: 'At 6 s real, PV and SoC move just below their boundaries', changes: { overrides: { pvW: 660, batteryVoltageV: 26.00 } } },
      { atSimS: 660, phase: 'RISING OVERLAP', label: 'At 11 s real, PV and SoC move just above their boundaries', changes: { overrides: { pvW: 740, batteryVoltageV: 26.08 } } },
      { atSimS: 960, phase: 'RETURNING OVERLAP', label: 'At 16 s real, PV and SoC return to their membership boundaries', changes: { overrides: { pvW: 700, batteryVoltageV: 26.04 } } },
    ],
    expectations: [
      { type: 'fuzzy_band', values: ['low', 'watch'], label: 'Noise remains within low/watch normal-control bands' },
      { type: 'tier2_action_absent', deviceId: 'sim-servers', action: 'off', label: 'Mandatory load is never shed by boundary noise' },
      {
        type: 'fuzzy_cycle', cycle: 1, mode: 'active', valid: true,
        ruleIds: { match: 'exact', values: [17] },
        riskScore: { min: 15, max: 20 }, inferredBand: 'low', controllerBand: 'low',
        transition: 'immediate_low_entry', fuzzyBranch: 'fuzzy.low.day.comfort_on',
        executedBranch: 'fuzzy.low.day.comfort_on',
        label: 'Cycle 1 establishes the rule-17 low-risk baseline at 5 seconds',
      },
      {
        type: 'fuzzy_cycle', cycle: 2, mode: 'active', valid: true,
        inputs: { net_power_trend: { min: -.08, max: -.07 } },
        memberships: {
          net_power_trend: {
            falling: { min: .45, max: .55 },
            steady: { min: .45, max: .55 },
          },
        },
        ruleIds: { match: 'exact', values: [4, 5, 7, 8, 13, 14, 16, 17] },
        inferredBand: 'watch', controllerBand: 'watch', transition: 'low_exit',
        fuzzyBranch: 'fuzzy.watch.preserve', executedBranch: 'fuzzy.watch.preserve',
        label: 'Cycle 2 evaluates the falling overlap without entering high',
      },
      {
        type: 'fuzzy_cycle', cycle: 3, mode: 'active', valid: true,
        inputs: { net_power_trend: { min: .005, max: .02 } },
        memberships: {
          net_power_trend: {
            steady: { min: .9, max: .95 },
            rising: { min: .05, max: .1 },
          },
        },
        ruleIds: { match: 'exact', values: [8, 9, 17, 18] },
        inferredBand: 'low', controllerBand: 'watch', transition: 'confirming_low_entry',
        fuzzyBranch: 'fuzzy.watch.preserve', executedBranch: 'fuzzy.watch.preserve',
        label: 'Cycle 3 evaluates the rising overlap while hysteresis retains watch',
      },
      {
        type: 'fuzzy_cycle', cycle: 4, mode: 'active', valid: true,
        inputs: { net_power_trend: { min: -.01, max: 0 } },
        memberships: {
          net_power_trend: {
            falling: { min: 0, max: .05 },
            steady: { min: .95, max: 1 },
          },
        },
        ruleIds: { match: 'exact', values: [7, 8, 16, 17] },
        inferredBand: 'watch', controllerBand: 'watch', transition: 'held',
        fuzzyBranch: 'fuzzy.watch.preserve', executedBranch: 'fuzzy.watch.preserve',
        label: 'Cycle 4 returns to the overlap without entering high',
      },
      { type: 'scenario_metric', metric: 'commandReversals', range: { min: 0, max: 0 }, label: 'Boundary noise produces no command reversal' },
    ],
  },
  {
    id: 'fuzzy-invalid-input', name: 'Fuzzy · invalid input crisp fallback', tier: 'Tier-2', durationRealS: 7,
    description: 'Only one telemetry snapshot exists before the first cycle, so trend baselines are missing and active fuzzy control falls back to crisp.',
    setup: { ...base, tier1: false, tier2: true, tier2Policy: 'fuzzy_active', pushIntervalS: 10, overrides: { pvW: 3000, heatsinkC: 40 } },
    events: [],
    expectations: [
      { type: 'fuzzy_fallback', value: 'invalid_pv_baseline_W,invalid_load_baseline_W', label: 'Missing baselines are explicit and trigger crisp fallback' },
      { type: 'tier2_branch', values: ['day.surplus.comfort_on'], label: 'Crisp branch executes during fuzzy input failure' },
      {
        type: 'fuzzy_cycle', cycle: 1, totalCycles: 1, mode: 'fallback', valid: false,
        fallbackReason: 'invalid_pv_baseline_W,invalid_load_baseline_W',
        membershipsEmpty: true, rulesEmpty: true, fuzzyBranch: null,
        executedBranch: 'day.surplus.comfort_on',
        action: { path: 'executed', deviceId: 'sim-ac-unit', action: 'on', stage: 'applied' },
        label: 'The only cycle records empty fuzzy evidence and the applied crisp fallback action',
      },
    ],
  },
  {
    id: 'fuzzy-shadow-comparison', name: 'Fuzzy · crisp execution with shadow evidence', tier: 'Tier-2', durationRealS: 12,
    description: 'Execute the crisp daytime branch while retaining the fuzzy watch branch and intents only as a counterfactual audit record.',
    setup: { ...base, tier1: false, tier2: true, tier2Policy: 'fuzzy_shadow', batterySocPercent: 20, overrides: { pvW: 3000, heatsinkC: 40 } },
    events: [],
    expectations: [
      { type: 'tier2_branch', values: ['day.surplus.comfort_on'], label: 'Crisp policy remains the executed shadow branch' },
      { type: 'counterfactual_branch', values: ['fuzzy.watch.preserve', 'fuzzy.high.buy_grid'], label: 'Fuzzy branch is retained only as counterfactual evidence' },
      {
        type: 'fuzzy_cycle', cycle: 1, mode: 'shadow', valid: true,
        ruleIds: { match: 'exact', values: [20] }, riskScore: { min: 49, max: 51 },
        inferredBand: 'watch', controllerBand: 'watch',
        fuzzyBranch: 'fuzzy.watch.preserve', executedBranch: 'day.surplus.comfort_on',
        action: { path: 'executed', deviceId: 'sim-ac-unit', action: 'on', stage: 'applied' },
        label: 'Cycle 1 separates rule-20 fuzzy evidence from the applied crisp action',
      },
    ],
  },
]
