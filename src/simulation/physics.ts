import type { BreakerStatusDTO, ClimateRow, PhysicalState, PowerFlow, SimulatedBreaker, SiteInputs, TelemetryDTO, WeatherCondition } from './types'

export const PERFORMANCE_RATIO = 0.85
export const CHARGE_EFFICIENCY = 0.95
export const AC_VOLTAGE_V = 230
export const WEATHER_PV_FACTOR: Record<WeatherCondition, number> = {
  sunny: 1, partly_cloudy: 0.75, cloudy: 0.45, rainy: 0.25, foggy: 0.2, storm: 0.1,
}
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function seasonForMonth(month: number) { return month >= 5 && month <= 10 ? 'summer' : 'winter' }
export function allowedWeather(row: ClimateRow): WeatherCondition[] {
  const values: WeatherCondition[] = ['sunny', 'partly_cloudy']
  if (row.cloud_amount_percent >= 25) values.push('cloudy')
  if (row.precip_mm_day >= 0.3) values.push('rainy')
  if (row.precip_mm_day >= 1.5) values.push('storm')
  if (row.humidity_percent >= 65) values.push('foggy')
  return values
}
export function pickAutoWeather(row: ClimateRow, date: Date, random = Math.random): WeatherCondition {
  const cloud = row.cloud_amount_percent
  const weights: Array<[WeatherCondition, number]> = [
    ['sunny', Math.max(100 - cloud, 5)], ['partly_cloudy', cloud * 0.55],
    ['cloudy', cloud * 0.45], ['rainy', row.precip_mm_day * 18],
    ['storm', row.precip_mm_day >= 1.5 ? row.precip_mm_day * 4 : 0],
    ['foggy', row.humidity_percent >= 65 && date.getHours() <= 9 ? row.humidity_percent - 60 : 0],
  ]
  let roll = random() * weights.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [label, weight] of weights) { roll -= weight; if (roll <= 0) return label }
  return 'sunny'
}
function declination(day: number) { return (23.45 * Math.PI / 180) * Math.sin(2 * Math.PI * (284 + day) / 365) }
export function solarElevationSin(date: Date, latitude: number) {
  const start = new Date(date.getFullYear(), 0, 0).getTime()
  const day = Math.floor((date.getTime() - start) / 86_400_000)
  const lat = latitude * Math.PI / 180
  const angle = ((date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600) - 12) * 15 * Math.PI / 180
  return Math.sin(lat) * Math.sin(declination(day)) + Math.cos(lat) * Math.cos(declination(day)) * Math.cos(angle)
}
export function solarWindow(date: Date, latitude: number) {
  let integralH = 0, sunriseH: number | null = null, sunsetH: number | null = null
  for (let minute = 0; minute < 1440; minute += 5) {
    const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minute)
    const elevation = Math.max(solarElevationSin(at, latitude), 0)
    integralH += elevation * 5 / 60
    if (elevation > 0 && sunriseH === null) sunriseH = minute / 60
    if (elevation > 0) sunsetH = minute / 60
  }
  return { integralH, sunriseH, sunsetH }
}
export function solarProduction(date: Date, row: ClimateRow, maxPvW: number, weather: WeatherCondition) {
  const window = solarWindow(date, row.latitude_deg)
  const clearDayWh = maxPvW * row.clearsky_ghi_kwh_m2_day * PERFORMANCE_RATIO
  const clearSkyW = window.integralH > 0
    ? Math.min(clearDayWh / window.integralH * Math.max(solarElevationSin(date, row.latitude_deg), 0), maxPvW) : 0
  const climateRatio = clamp(row.ghi_kwh_m2_day / row.clearsky_ghi_kwh_m2_day, 0, 1)
  const typicalFactor = WEATHER_PV_FACTOR[row.typical_weather]
  const conditionFactor = clamp(
    WEATHER_PV_FACTOR[weather] * climateRatio / Math.max(typicalFactor, .01), 0, 1,
  )
  return { ...window, clearSkyW, adjustedW: clearSkyW * conditionFactor }
}
export function breakerDrawW(breaker: SimulatedBreaker, simMs: number) {
  if (!breaker.switchOn || !breaker.online || breaker.priorityType === 'ac_grid') return 0
  const peak = breaker.onSinceMs !== null && simMs - breaker.onSinceMs < breaker.peakMinutes * 60_000
  return peak ? breaker.peakW : breaker.normalW
}
export function batterySocFromVoltage(voltage: number, floor: number, nominal: number) {
  const full = Math.max(27.4 * nominal / 24, floor + 0.1)
  return clamp((voltage - floor) / (full - floor), 0, 1)
}
export function batteryVoltage(soc: number, dischargeW: number, site: SiteInputs) {
  const scale = site.batteryNominalV / 24
  const full = Math.max(27.4 * scale, site.batteryFloorV + 0.1)
  return site.batteryFloorV + (full - site.batteryFloorV) * soc - 1.2 * scale * dischargeW / Math.max(site.batteryCapacityWh, 1)
}
export function stepPhysical(state: PhysicalState, site: SiteInputs, row: ClimateRow, simDtS: number): PowerFlow {
  const solar = solarProduction(new Date(state.simMs), row, site.maxPvW, state.weather)
  const pvW = state.overrides.pvW ?? solar.adjustedW
  const pvUsableW = pvW >= site.pvThresholdW ? pvW : 0
  const loadW = state.breakers.reduce((sum, breaker) => sum + breakerDrawW(breaker, state.simMs), 0)
  const gridOn = state.breakers.some((b) => b.priorityType === 'ac_grid' && b.switchOn && b.online)
  const gridSupplying = gridOn && site.gridAvailable
  const net = pvUsableW - loadW
  const chargeW = gridSupplying ? pvUsableW : Math.max(net, 0)
  const dischargeW = gridSupplying ? 0 : Math.max(-net, 0)
  state.batterySocWh = clamp(state.batterySocWh + chargeW * CHARGE_EFFICIENCY * simDtS / 3600 - dischargeW * simDtS / 3600, 0, site.batteryCapacityWh)
  if (state.overrides.batteryVoltageV !== undefined) state.batterySocWh = site.batteryCapacityWh * batterySocFromVoltage(state.overrides.batteryVoltageV, site.batteryFloorV, site.batteryNominalV)
  const socFrac = state.batterySocWh / site.batteryCapacityWh
  const targetC = row.temp_C + 30 * loadW / site.maxInverterW + 8 * pvW / Math.max(site.maxPvW, 1)
  state.heatsinkC += (targetC - state.heatsinkC) * Math.min(simDtS / 300, 1)
  const vBat = state.overrides.batteryVoltageV ?? batteryVoltage(socFrac, dischargeW, site)
  return {
    pvW, clearSkyW: solar.clearSkyW, pvUsableW, loadW, gridOn, gridSupplying,
    chargeW, dischargeW, socFrac, batteryVoltageV: vBat,
    chargeCurrentA: state.overrides.batteryChargeCurrentA ?? chargeW / Math.max(vBat, .1),
    dischargeCurrentA: state.overrides.batteryDischargeCurrentA ?? dischargeW / Math.max(vBat, .1),
    heatsinkC: state.overrides.heatsinkC ?? state.heatsinkC,
    gridVoltageV: state.overrides.gridVoltageV ?? (gridSupplying ? AC_VOLTAGE_V : 0),
    empty: !gridSupplying && dischargeW > 0 && state.batterySocWh <= 0,
    sunriseH: solar.sunriseH, sunsetH: solar.sunsetH,
  }
}
export function buildTelemetry(flow: PowerFlow, site: SiteInputs, organization: number, simMs: number): TelemetryDTO {
  return {
    organization, timestamp: new Date(simMs).toISOString(), grid_voltage_V: +flow.gridVoltageV.toFixed(2),
    grid_freq_Hz: flow.gridVoltageV >= 100 ? 50 : 0, ac_output_voltage_V: AC_VOLTAGE_V,
    ac_output_freq_Hz: 50, ac_output_apparent_power_VA: Math.round(flow.loadW / .95),
    ac_output_active_power_W: Math.round(flow.loadW), output_load_percent: Math.round(100 * flow.loadW / site.maxInverterW),
    bus_voltage_V: 360, battery_voltage_V: +flow.batteryVoltageV.toFixed(2),
    battery_charge_current_A: +flow.chargeCurrentA.toFixed(2), battery_capacity_percent: Math.round(flow.socFrac * 100),
    heatsink_temp_C: +flow.heatsinkC.toFixed(1), pv_input_current_A: +(flow.pvW > 0 ? flow.pvW / 330 : 0).toFixed(2),
    pv_input_voltage_V: flow.pvW > 0 ? 330 : 0, battery_voltage_scc_V: +flow.batteryVoltageV.toFixed(2),
    battery_discharge_current_A: +flow.dischargeCurrentA.toFixed(2), device_status_flags: '00010000',
    battery_voltage_offset_fans_on: 0, eeprom_version: 'react-sim-2', pv_charging_power_W: Math.round(flow.pvUsableW), device_status_flags2: '00',
  }
}
export function buildBreakerStatuses(breakers: SimulatedBreaker[], simMs: number): BreakerStatusDTO[] {
  return breakers.map((breaker) => {
    const draw = breakerDrawW(breaker, simMs)
    return { device_id: breaker.deviceId, timestamp: new Date(simMs).toISOString(), switch: breaker.switchOn,
      countdown_1_s: breaker.countdownS, cur_current_mA: Math.round(draw / AC_VOLTAGE_V * 1000),
      cur_power_mW: Math.round(draw * 1000), cur_voltage_mV: AC_VOLTAGE_V * 1000,
      fault: breaker.fault, relay_status: 'last', child_lock: breaker.lockedOut,
      cycle_time: '', online: breaker.online }
  })
}
export function tier1Payload(flow: PowerFlow, state: PhysicalState, site: SiteInputs) {
  return {
    inverter: { ac_output_active_power_W: flow.loadW, heatsink_temp_C: flow.heatsinkC,
      battery_voltage_V: flow.batteryVoltageV, battery_capacity_percent: flow.socFrac * 100,
      battery_charge_current_A: flow.chargeCurrentA, battery_discharge_current_A: flow.dischargeCurrentA,
      grid_voltage_V: flow.gridVoltageV, pv_charging_power_W: flow.pvUsableW },
    breakers: state.breakers.map((b) => ({ device_id: b.deviceId, priority_type: b.priorityType,
      priority_degree: b.priorityDegree, switch: b.switchOn, online: b.online,
      cur_power_W: breakerDrawW(b, state.simMs) })),
    config: { heatsink_temp_limit_C: 70, max_inverter_power_W: site.maxInverterW,
      overload_fraction: 1.05, battery_low_voltage_V: site.batteryFloorV,
      battery_low_margin_V: .5, battery_critical_margin_V: .1,
      battery_capacity_Wh: site.batteryCapacityWh, battery_shutdown_buffer_percent: 2,
      grid_present_min_V: 100 },
  }
}
